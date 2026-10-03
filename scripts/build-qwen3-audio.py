#!/usr/bin/env python3
"""Resumable offline Qwen3 Mandarin narration on Apple Silicon.

Install scripts/requirements-qwen3.txt in a Python 3.12 environment. Download
the pinned public model using download-qwen3-model.py, then run this script.
No cloud synthesis or API credentials are used. The default output is private;
only a complete, independently audited release may replace public/audio.
"""

import argparse
from collections import OrderedDict
from datetime import datetime, timezone
import hashlib
import importlib.util
from importlib.metadata import version
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
REPO = 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-6bit'
REVISION = '1c6c0ff58c43afa8df571facde2efa077efd85e2'
MODEL_SHA256 = '097b66a8c63570b88abc2fb393d1dc2360394ca7741c818455ba9da257ac2f3b'
TOKENIZER_SHA256 = '836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258'
RATE = 24000
PREFIX = 'qwen3-'
VOICE = 'Vivian'
MAX_GENERATION_ATTEMPTS = 6
STYLE = '用活泼灵动、温柔亲切的年轻女生声音，带着微笑陪小朋友学习。普通话咬字清晰，语速适中，停顿自然，句尾轻柔地收住。'
SAMPLING = dict(temperature=0.9, top_p=1.0, top_k=50, repetition_penalty=1.05)
PROCESSING = 'complete-native-waveform-peak0.95-pad180ms-no-time-stretch-v1'
QUALITY_GATE = dict(minSeconds=0.22, minSecondsPerSyllable=0.10,
                    maxFloorSeconds=4, maxSecondsPerSyllable=0.60, maxExtraSeconds=3,
                    requireNaturalStop=True)

# Reuse only standard-library container and text helpers. Importing this module
# never loads Kokoro, Torch, a model or credentials.
_spec = importlib.util.spec_from_file_location('narration_common', ROOT / 'scripts/build-kokoro-audio.py')
_common = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_common)
atomic_json, digest, inspect_aac = _common.atomic_json, _common.digest, _common.inspect_aac
export_plan, log = _common.export_plan, _common.log

# Homophones are scoped to explicit lesson positions. They are synthesis input
# only; UI labels and transcript mappings retain the original course text.
PRIMARY_READINGS = dict(zip('长地子调似尽倒弹佛个得过', '常弟紫条四近岛谈佛各德过'))
QUIZ_READINGS = {**PRIMARY_READINGS, **dict(zip('为教处切划兴斗率背', '围浇楚切滑姓抖帅杯'))}
READING_OVERRIDE_CONFIG = {
    'version': 1,
    'adapter': 'qwen3-scoped-homophones-and-chinese-pinyin-cues-v1',
    'primaryReadings': PRIMARY_READINGS,
    'quotedQuizReadings': QUIZ_READINGS,
    'pinyinInitials': _common.INITIALS,
    'pinyinFinals': _common.FINALS,
    'teachingReplacements': {'声母得，听起来像得。': '声母德，听起来像德。',
        '声母勒，听起来像勒。': '声母乐，听起来像乐。',
        '这是舌尖韵母，跟着读子。': '这是舌尖韵母，跟着读紫。',
        '这是舌尖韵母，跟着读似。': '这是舌尖韵母，跟着读四。'},
    'wordReadings': {'长绳': '常绳'},
    'rareGlyphs': {'𣲗': '湋', '𫛸': '鶗'},
    'policy': 'Only explicit isolated teaching positions change; all other word contexts remain intact.',
}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


READING_OVERRIDE_SHA256 = hashlib.sha256(canonical(READING_OVERRIDE_CONFIG).encode()).hexdigest()


def reading_text(text):
    text = _common.reading_text(text)
    text = READING_OVERRIDE_CONFIG['teachingReplacements'].get(text, text)
    for before, after in READING_OVERRIDE_CONFIG['wordReadings'].items():
        text = text.replace(before, after)
    quiz = re.fullmatch(r'“([^”])”是什么意思？|哪个词里有“([^”])”？', text)
    if quiz:
        glyph = quiz.group(1) or quiz.group(2)
        text = text.replace(f'“{glyph}”', f'“{QUIZ_READINGS.get(glyph, glyph)}”')
    else:
        for glyph, reading in PRIMARY_READINGS.items():
            if text == glyph or text.startswith(glyph + '。'):
                text = reading + text[1:]
                break
            if text == f'找对啦！{glyph}，读作{glyph}。':
                text = f'找对啦！{reading}，读作{reading}。'
                break
    return text if re.search(r'[。！？!?]$', text) else text + '。'


def renderer_configuration():
    """Auditable constants, independent of model installation or GPU access."""
    return dict(renderer='qwen3-mlx-local-v1', model=REPO, revision=REVISION,
        modelSHA256=MODEL_SHA256, tokenizerSHA256=TOKENIZER_SHA256,
        sampleRate=RATE, voice=VOICE, speed=1, style=STYLE, sampling=SAMPLING,
        processing=PROCESSING, qualityGate=QUALITY_GATE, readingOverrideSHA256=READING_OVERRIDE_SHA256,
        seedPolicy='first-file-sha256-plus-attempt-v1', bitrate=48000,
        mlxAudio='0.5.7', mlx='0.32.3')


def filename(signature, spoken):
    return PREFIX + hashlib.sha256((signature + '\0' + spoken).encode()).hexdigest()[:20] + '.m4a'


def prepare_audio(wave, np):
    audio = np.asarray(wave, dtype=np.float32)
    if audio.ndim != 1 or not len(audio) or not np.isfinite(audio).all():
        raise ValueError('Invalid waveform')
    peak = float(np.max(np.abs(audio)))
    if peak < 0.0001:
        raise ValueError('Silent waveform')
    if peak > 0.95:
        audio = audio * (0.95 / peak)
    # Keep the complete model output. Do not trim a quiet final syllable or
    # change playback speed at the ending. Padding is outside the spoken audio.
    return np.concatenate([audio, np.zeros(round(RATE * 0.18), dtype=np.float32)])


def maximum_duration(text):
    syllables = len(re.findall(r'[\u3400-\u9fff]', text))
    return max(QUALITY_GATE['maxFloorSeconds'],
               syllables * QUALITY_GATE['maxSecondsPerSyllable'] + QUALITY_GATE['maxExtraSeconds'])


def generation_token_limit(texts):
    # The pinned tokenizer emits 1,920 samples per frame (12.5 Hz). Stop
    # wasting compute once a clip would necessarily fail the duration gate.
    # Four frames of headroom keep every duration-valid natural stop intact.
    return math.ceil(max(maximum_duration(text) for text in texts) * 12.5) + 4


def checked_duration(audio, text, token_count, token_limit):
    if token_count >= token_limit:
        raise ValueError('Generation reached token limit without a natural stop')
    duration = len(audio) / RATE
    syllables = len(re.findall(r'[\u3400-\u9fff]', text))
    if not max(QUALITY_GATE['minSeconds'], syllables * QUALITY_GATE['minSecondsPerSyllable']) <= duration <= maximum_duration(text):
        raise ValueError(f'Implausible narration duration: {duration:.2f}s for {syllables} syllables')
    return duration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, default=ROOT / '.audio-cache/qwen3/model')
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.audio-cache/qwen3/release')
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--limit', type=int, help='Generate this many pending clips; do not publish a manifest')
    parser.add_argument('--samples', action='store_true', help='Generate a separate listening set without a release manifest')
    args = parser.parse_args()
    if args.batch_size < 1 or (args.limit is not None and args.limit < 1):
        parser.error('Batch size and limit must be positive')
    if args.samples and args.output_dir == ROOT / '.audio-cache/qwen3/release':
        args.output_dir = ROOT / '.audio-cache/qwen3/samples'
    output = args.output_dir.resolve()
    if output == (ROOT / 'public/audio').resolve():
        parser.error('Generate into a staging directory, audit it, then publish the complete release')
    output.mkdir(parents=True, exist_ok=True)
    cache = ROOT / '.audio-cache/qwen3'
    cache.mkdir(parents=True, exist_ok=True)
    for key in ['HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN', 'DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'OPENAI_API_KEY']:
        os.environ.pop(key, None)
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1',
                      HF_HUB_DISABLE_IMPLICIT_TOKEN='1', HF_HOME=str(cache / 'hf'))
    for path, expected in [('model.safetensors', MODEL_SHA256), ('speech_tokenizer/model.safetensors', TOKENIZER_SHA256)]:
        if digest(args.model_dir / path) != expected:
            raise ValueError(f'Local model SHA256 mismatch: {path}')
    for package, expected in [('mlx-audio', '0.5.7'), ('mlx', '0.32.3')]:
        if version(package) != expected:
            raise ValueError(f'Install the pinned {package}=={expected} before synthesis')
    config = renderer_configuration()
    config['configSHA256'] = digest(args.model_dir / 'config.json')
    signature = canonical(config)
    key = hashlib.sha256((signature + str(output)).encode()).hexdigest()[:20]
    ledger = cache / f'receipts-{key}.jsonl'
    checkpoint = cache / f'progress-{key}.json'
    plan = json.loads(args.plan.read_text()) if args.plan else export_plan()
    if args.samples:
        examples = ['山', '声母b，听起来像波。', '韵母üe，听起来像约。',
            '欢迎来到动物园！先选一个园区，看看哪位朋友在等你。',
            '跟着小星星，画好这一笔。', '你做得真认真，继续慢慢试一试吧！',
            '小兔喜欢吃草，也能吃一点胡萝卜。',
            '床前明月光，疑是地上霜。举头望明月，低头思故乡。']
        plan = dict(entries=[dict(text=text, spoken=text, kind='listening-sample') for text in examples], planSHA256=None)
    grouped = OrderedDict()
    files = {}
    for entry in plan['entries']:
        name = filename(signature, entry['spoken'])
        files[entry['text']] = '/audio/' + name
        grouped.setdefault(name, dict(spoken=entry['spoken'], reading=reading_text(entry['spoken'])))
    receipts = {}
    if ledger.exists():
        for line in ledger.read_text().splitlines():
            try:
                record = json.loads(line)
                receipts[record['file']] = record
            except (ValueError, KeyError):
                pass  # An interrupted final append is regenerated, never trusted.
    pending = []
    resumed = 0
    for name, item in grouped.items():
        record = receipts.get(name)
        try:
            valid = (record and record.get('naturalStop') is True and
                digest(output / name) == record['sha256'] and inspect_aac(output / name) > 0)
        except (OSError, ValueError, KeyError):
            valid = False
        if valid:
            resumed += 1
        else:
            pending.append((name, item))
    # Similar text lengths minimize the time spent padding finished sequences.
    pending.sort(key=lambda task: (len(task[1]['reading']), task[0]))
    maximum = min(args.limit or len(pending), len(pending))
    log('plan', texts=len(files), clips=len(grouped), resumed=resumed, pending=len(pending),
        batchSize=args.batch_size, signature=key, outputDirectory=str(output))
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    started = time.monotonic()
    model = load_model(str(args.model_dir.resolve())) if maximum else None
    log('loaded', seconds=round(time.monotonic() - started, 2))
    generated = 0
    recorded_seconds = 0
    generated_work = 0
    pending_work = sum(len(item['reading']) + 8 for _, item in pending)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='ziyou-qwen3-encode-') as temporary:
        wav, encoded = Path(temporary) / 'clip.wav', Path(temporary) / 'clip.m4a'

        def synthesize(batch, attempt=0):
            nonlocal generated, recorded_seconds, generated_work
            mx.random.seed(int(batch[0][0][6:14], 16) + attempt)
            token_limit = generation_token_limit([item['reading'] for _, item in batch])
            remaining = set(range(len(batch)))
            failed = []
            for result in model.batch_generate(texts=[item['reading'] for _, item in batch],
                    voices=[VOICE] * len(batch), instructs=[STYLE] * len(batch),
                    lang_code='Chinese', max_tokens=token_limit, **SAMPLING):
                index = result.sequence_idx
                if index not in remaining or result.sample_rate != RATE:
                    raise ValueError('Unexpected synthesis sequence or sample rate')
                remaining.remove(index)
                name, item = batch[index]
                try:
                    wave = prepare_audio(np.array(result.audio), np)
                    duration = checked_duration(wave, item['reading'], result.token_count, token_limit)
                    sf.write(wav, wave, RATE, subtype='PCM_16')
                    encoded.unlink(missing_ok=True)
                    subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '48000',
                                    str(wav), str(encoded)], check=True, capture_output=True)
                    encoded_duration = inspect_aac(encoded)
                    if abs(encoded_duration - duration) > 0.25:
                        raise ValueError('Encoded duration differs from complete waveform')
                    record = dict(file=name, sha256=digest(encoded), spoken=item['spoken'],
                        reading=item['reading'], tokens=result.token_count, tokenLimit=token_limit,
                        naturalStop=True, duration=round(encoded_duration, 3), attempt=attempt,
                        generatedAt=datetime.now(timezone.utc).isoformat())
                    os.replace(encoded, output / name)
                    with ledger.open('a') as handle:
                        handle.write(canonical(record) + '\n')
                        handle.flush()
                        os.fsync(handle.fileno())
                    receipts[name] = record
                    generated += 1
                    recorded_seconds += duration
                    generated_work += len(item['reading']) + 8
                except (ValueError, OSError, subprocess.CalledProcessError) as error:
                    log('retry', file=name, text=item['spoken'], attempt=attempt, error=str(error))
                    failed.append(batch[index])
            failed.extend(batch[index] for index in remaining)
            mx.clear_cache()
            if failed:
                if attempt + 1 >= MAX_GENERATION_ATTEMPTS:
                    raise ValueError(f'{len(failed)} clips failed validation after {MAX_GENERATION_ATTEMPTS} attempts')
                synthesize(failed, attempt + 1)

        for offset in range(0, maximum, args.batch_size):
            synthesize(pending[offset:min(offset + args.batch_size, maximum)])
            elapsed = time.monotonic() - started
            progress = dict(validated=resumed + generated, total=len(grouped), generated=generated,
                resumed=resumed, elapsedSeconds=round(elapsed, 1), recordedSeconds=round(recorded_seconds, 1),
                remainingSeconds=round((pending_work - generated_work) * elapsed / generated_work) if generated_work else None,
                outputDirectory=str(output), rendererSignature=signature)
            atomic_json(checkpoint, progress)
            log('progress', **{k: v for k, v in progress.items() if k not in ['rendererSignature', 'outputDirectory']})
    complete = not args.samples and args.limit is None and resumed + generated == len(grouped)
    if args.samples:
        atomic_json(output / 'sample-report.json', dict(rendererSignature=signature,
                    samples=[receipts[name] for name in grouped if name in receipts], complete=False))
    if complete:
        if export_plan()['planSHA256'] != plan['planSHA256']:
            raise ValueError('Narration plan changed; resume with the current plan before publishing')
        unexpected = [p.name for p in output.iterdir() if p.name != 'manifest.json' and p.name not in grouped]
        if unexpected:
            raise ValueError('Staging directory contains audio from another plan or renderer')
        for name in grouped:
            if digest(output / name) != receipts[name]['sha256']:
                raise ValueError(f'Audio changed after synthesis: {name}')
            inspect_aac(output / name)
        manifest = dict(version=3, renderer='qwen3-mlx-local', rendererSignature=signature,
            filePrefix=PREFIX, hashAlgorithm='sha256-renderer-null-spoken-v1',
            model=REPO, modelRevision=REVISION, modelSHA256=MODEL_SHA256, modelLicense='Apache-2.0',
            voice=VOICE, lang='zh-CN', rate=1, defaultPlaybackRate=1, format='aac-m4a',
            pronunciationOverrides=READING_OVERRIDE_CONFIG, pronunciationOverridesSHA256=READING_OVERRIDE_SHA256,
            pronunciationCacheCorrection=dict(complete=True, overrideSHA256=READING_OVERRIDE_SHA256,
                source='reading-config-in-content-addressed-renderer-signature'),
            complete=True, total=len(plan['entries']), uniqueRequiredFiles=len(grouped),
            planSHA256=plan['planSHA256'], generatedAt=datetime.now(timezone.utc).isoformat(), files=files,
            generationValidation=dict(naturalStops=len(grouped), sha256Verified=len(grouped)),
            pronunciationReview='Scoped synthesis reading inputs and structural checks; not full human listening review.')
        atomic_json(output / 'manifest.json', manifest)
    log('complete', complete=complete, generated=generated, resumed=resumed, checkpoint=str(checkpoint))


if __name__ == '__main__':
    main()
