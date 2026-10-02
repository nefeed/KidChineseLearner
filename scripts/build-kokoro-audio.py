#!/usr/bin/env python3
"""Resumable, local Mandarin narration using the Apache-2.0 Kokoro model.

Use Python 3.12 in an isolated environment, then install:
  pip install kokoro==0.9.4 'misaki[zh]==0.9.4' torch==2.7.1 \
    transformers==4.51.3 'spacy<3.9' 'spacy-curated-transformers<1' soundfile \
    pypinyin==0.55.0 pypinyin-dict==0.9.0 jieba==0.42.1 cn2an==0.5.24
  python scripts/build-kokoro-audio.py --device cpu --threads 2 --workers 4

Only public model files are downloaded. Text stays on this machine. A limited
run saves validated clips and a private checkpoint, but never replaces the
public manifest. Rerunning with the same renderer resumes those clips.
"""

import argparse
from collections import OrderedDict
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
REVISION = '01e7505bd6a7a2ac4975463114c3a7650a9f7218'
MODEL_SHA256 = 'b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b'
RATE = 24000
PREFIX = 'kokoro-'
PRIMARY_READING_OVERRIDES = {
    '长': {'pinyin': 'cháng', 'phonemes': 'ㄔㄤ2'},
    '地': {'pinyin': 'dì', 'phonemes': 'ㄉㄧ4'},
    '子': {'pinyin': 'zǐ', 'phonemes': 'ㄗㄭ3'},
    '调': {'pinyin': 'tiáo', 'phonemes': 'ㄊ要2'},
    '似': {'pinyin': 'sì', 'phonemes': 'ㄙㄭ4'},
    '尽': {'pinyin': 'jìn', 'phonemes': 'ㄐ阴4'},
    '倒': {'pinyin': 'dǎo', 'phonemes': 'ㄉㄠ3'},
    '弹': {'pinyin': 'tán', 'phonemes': 'ㄊㄢ2'},
    '佛': {'pinyin': 'fó', 'phonemes': 'ㄈㄛ2'},
    # Misaki's neutral-tone rules also shorten these even when spoken alone.
    '个': {'pinyin': 'gè', 'phonemes': 'ㄍㄜ4'},
    '得': {'pinyin': 'dé', 'phonemes': 'ㄉㄜ2'},
    '过': {'pinyin': 'guò', 'phonemes': 'ㄍ我4'},
}
EXACT_TEACHING_TEMPLATES = {
    '声母佛，听起来像佛。': {'before': '声母', 'glyph': '佛', 'middle': '，听起来像'},
    '声母得，听起来像得。': {'before': '声母', 'glyph': '得', 'middle': '，听起来像'},
    '声母勒，听起来像勒。': {'before': '声母', 'glyph': '勒', 'middle': '，听起来像', 'phonemes': 'ㄌㄜ4'},
    '韵母儿，听起来像耳。': {'before': '韵母', 'glyph': '儿', 'middle': '，听起来像', 'phonemes': 'ㄦ2', 'secondPhonemes': 'ㄦ3'},
    '韵母儿，听起来像二。': {'before': '韵母', 'glyph': '儿', 'middle': '，听起来像', 'phonemes': 'ㄦ2', 'secondPhonemes': 'ㄦ4'},
    '韵母儿，听起来像而。': {'before': '韵母', 'glyph': '儿', 'middle': '，听起来像', 'phonemes': 'ㄦ2', 'secondPhonemes': 'ㄦ2'},
    '韵母儿，听起来像儿。': {'before': '韵母', 'glyph': '儿', 'middle': '，听起来像', 'phonemes': 'ㄦ2', 'secondPhonemes': 'ㄦ2'},
    '韵母儿，听起来像尔。': {'before': '韵母', 'glyph': '儿', 'middle': '，听起来像', 'phonemes': 'ㄦ2', 'secondPhonemes': 'ㄦ3'},
    '这是舌尖韵母，跟着读子。': {'before': '这是舌尖韵母，跟着读', 'glyph': '子'},
    '这是舌尖韵母，跟着读似。': {'before': '这是舌尖韵母，跟着读', 'glyph': '似'},
}
# These two questions name the lesson glyph in isolation. The nine additional
# readings here affect only these exact questions; word contexts stay intact.
QUOTED_QUIZ_READINGS = {
    **PRIMARY_READING_OVERRIDES,
    '为': {'pinyin': 'wéi', 'phonemes': '为2'},
    '教': {'pinyin': 'jiāo', 'phonemes': 'ㄐ要1'},
    '处': {'pinyin': 'chǔ', 'phonemes': 'ㄔㄨ3'},
    '切': {'pinyin': 'qiē', 'phonemes': 'ㄑㄝ1'},
    '划': {'pinyin': 'huá', 'phonemes': 'ㄏ穵2'},
    '兴': {'pinyin': 'xìng', 'phonemes': 'ㄒ应4'},
    '斗': {'pinyin': 'dǒu', 'phonemes': 'ㄉㄡ3'},
    '率': {'pinyin': 'shuài', 'phonemes': 'ㄕ外4'},
    '背': {'pinyin': 'bēi', 'phonemes': 'ㄅㄟ1'},
}
QUOTED_QUIZ_TEMPLATES = ['“{glyph}”是什么意思？', '哪个词里有“{glyph}”？']
READING_OVERRIDE_CONFIG = {
    'version': 1,
    'scope': ['standalone-course-glyph', 'glyph-before-full-stop', 'exact-read-as-feedback', 'exact-pinyin-teaching-template', 'exact-quoted-quiz-glyph'],
    'primaryReadings': PRIMARY_READING_OVERRIDES,
    'teachingTemplates': EXACT_TEACHING_TEMPLATES,
    'quotedQuizReadings': QUOTED_QUIZ_READINGS,
    'quotedQuizTemplates': QUOTED_QUIZ_TEMPLATES,
    'verifiedWordReading': {'长绳': 'cháng shéng'},
    'contextPolicy': 'All other contexts use the unmodified Misaki phrase dictionary and tone sandhi.',
}
READING_OVERRIDE_SHA256 = hashlib.sha256(json.dumps(READING_OVERRIDE_CONFIG, ensure_ascii=False,
                                                     sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def log(event, **fields):
    print(json.dumps({'event': event, **fields}, ensure_ascii=False), flush=True)


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.partial')
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    os.replace(temporary, path)


def download_model(directory, voice):
    directory.mkdir(parents=True, exist_ok=True)
    for name in ['config.json', 'kokoro-v1_1-zh.pth', f'voices/{voice}.pt']:
        path = directory / name
        if path.exists():
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + '.partial')
        url = f'https://huggingface.co/{REPO}/resolve/{REVISION}/{name}'
        log('download', file=name, source=REPO, revision=REVISION)
        # urllib does not consult Hugging Face credentials or send API keys.
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open('wb') as target:
            while block := response.read(1024 * 1024):
                target.write(block)
        os.replace(temporary, path)
    if digest(directory / 'kokoro-v1_1-zh.pth') != MODEL_SHA256:
        raise ValueError('Kokoro model does not match the published SHA256.')


def export_plan():
    command = [str(ROOT / 'node_modules/.bin/tsx'), str(ROOT / 'scripts/export-audio-plan.mjs')]
    return json.loads(subprocess.check_output(command, cwd=ROOT, text=True))


def atoms(data, start=0, end=None):
    end = len(data) if end is None else end
    while start < end:
        if start + 8 > end:
            raise ValueError('Truncated MP4 header')
        size, kind = struct.unpack_from('>I4s', data, start)
        header = 8
        if size == 1:
            if start + 16 > end:
                raise ValueError('Truncated MP4 large header')
            size = struct.unpack_from('>Q', data, start + 8)[0]
            header = 16
        if size == 0:
            size = end - start
        if size < header or start + size > end:
            raise ValueError('Invalid MP4 atom size')
        yield kind, start + header, start + size
        start += size


def inspect_aac(path):
    data = path.read_bytes()
    top = list(atoms(data))
    if not any(kind == b'ftyp' for kind, _, _ in top):
        raise ValueError('Missing MP4 type')
    if not any(kind == b'mdat' and end - start > 10 for kind, start, end in top):
        raise ValueError('Empty AAC payload')
    movie = next((a for a in top if a[0] == b'moov'), None)
    if movie is None:
        raise ValueError('Missing finalized MP4 movie')
    header = next((a for a in atoms(data, movie[1], movie[2]) if a[0] == b'mvhd'), None)
    if header is None or b'mp4a' not in data:
        raise ValueError('Missing AAC track or duration')
    offset = header[1]
    if header[2] - offset < 1:
        raise ValueError('Truncated MP4 duration header')
    variant = data[offset]
    if variant not in [0, 1]:
        raise ValueError('Unsupported MP4 duration header')
    if header[2] - offset < (32 if variant else 20):
        raise ValueError('Truncated MP4 duration fields')
    scale = struct.unpack_from('>I', data, offset + (20 if variant else 12))[0]
    ticks = struct.unpack_from('>Q' if variant else '>I', data, offset + (24 if variant else 16))[0]
    if not scale or not ticks:
        raise ValueError('Zero AAC duration')
    return ticks / scale


def is_valid(path):
    try:
        return inspect_aac(path)
    except (OSError, ValueError, StopIteration, struct.error):
        return False


# Pinyin guides already include these Chinese analogues. Read their Latin
# labels explicitly rather than passing them to the Chinese frontend, which
# otherwise emits an unknown token or drops them. These are reading cues,
# not claims that a whole Chinese syllable is an isolated consonant.
INITIALS = dict(b='波', p='坡', m='摸', f='佛', d='得', t='特', n='呢', l='勒',
                g='哥', k='科', h='喝', j='鸡', q='七', x='西', zh='知', ch='吃',
                sh='诗', r='日', z='资', c='词', s='思', y='衣', w='乌')
FINALS = dict(a='啊', o='喔', e='鹅', i='衣', u='乌', ai='哀', ei='诶', ao='凹',
              ou='欧', an='安', en='恩', ang='昂', eng='哼的后半段', ong='翁的后半段',
              ia='呀', ie='耶', iao='腰', iu='优', iou='优', ian='烟', in_='因',
              iang='央', ing='英', iong='雍', ua='蛙', uo='窝', uai='歪', ui='威',
              uei='威', uan='弯', un='温', uen='温', uang='汪', ueng='翁', er='儿')
FINALS['in'] = FINALS.pop('in_')
FINALS.update({'ü': '迂', 'üe': '约', 'ue': '约', 'üan': '冤', 'ün': '晕'})


def reading_text(text):
    def replace(match):
        category, spelling = match.groups()
        readings = INITIALS if category == '声母' else FINALS
        if spelling not in readings:
            raise ValueError(f'Unrecognized pinyin cue: {spelling}')
        return category + readings[spelling]
    result = re.sub(r'(声母|韵母)([a-zü]+)', replace, text)
    # The separator in poem titles is a pause, not a spoken glyph. Misaki's
    # Mandarin frontend otherwise treats this punctuation as an unknown token.
    result = result.replace('·', '，')
    # Canonical reading forms of the two extension-plane glyphs preserved in
    # the poetry source: Geng Wei's name and the bird name ti-jue. Misaki's
    # frontend recognizes their BMP forms. Written labels remain unchanged.
    result = result.replace('𣲗', '湋').replace('𫛸', '鶗')
    if re.search(r'[A-Za-zü]', result):
        raise ValueError(f'Unreviewed Latin text in Mandarin narration: {text}')
    return result


def reject_english(text):
    raise ValueError(f'Unexpected Latin text reached the Mandarin frontend: {text}')


def course_g2p(base_g2p):
    """Override only unambiguous teaching positions, preserving word readings."""
    def phonemize(text):
        # This word is an attested length reading; 常 supplies identical sound
        # without changing the global 长 default or growth/title contexts.
        text = text.replace('长绳', '常绳')
        cue = EXACT_TEACHING_TEMPLATES.get(text)
        if cue is not None:
            before, _ = base_g2p(cue['before'])
            sound = cue.get('phonemes') or PRIMARY_READING_OVERRIDES[cue['glyph']]['phonemes']
            ending, _ = base_g2p('。')
            if 'middle' in cue:
                middle, _ = base_g2p(cue['middle'])
                return before + ' ' + sound + middle + ' ' + cue.get('secondPhonemes', sound) + ending, None
            return before + ' ' + sound + ending, None
        quiz = re.fullmatch(r'“([^”])”是什么意思？|哪个词里有“([^”])”？', text)
        if quiz:
            glyph = quiz.group(1) or quiz.group(2)
            reading = QUOTED_QUIZ_READINGS.get(glyph)
            if reading is not None:
                phonemes, _ = base_g2p(text)
                phonemes, count = re.subn(r'(?<=“)[^”]+(?=”)', reading['phonemes'], phonemes, count=1)
                if count != 1:
                    raise ValueError('The quoted course glyph was not preserved by the Mandarin frontend.')
                return phonemes, None
        for glyph, reading in PRIMARY_READING_OVERRIDES.items():
            ps = reading['phonemes']
            if text == glyph:
                return ps, None
            if text.startswith(glyph + '。'):
                remainder, _ = base_g2p(text[1:])
                return ps + remainder, None
            if text == f'找对啦！{glyph}，读作{glyph}。':
                before, _ = base_g2p('找对啦！')
                middle, _ = base_g2p('，读作')
                ending, _ = base_g2p('。')
                return before + ' ' + ps + middle + ' ' + ps + ending, None
        return base_g2p(text)
    return phonemize


def read_reading_cache_record(path):
    try:
        record = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    return record if isinstance(record, dict) else None


def ensure_corrected_cache(output, tasks, signature, cache):
    """Track the active reading configuration before trusting cached audio."""
    key = hashlib.sha256(signature.encode()).hexdigest()[:20]
    output_directory = str(output.resolve())
    output_key = hashlib.sha256(output_directory.encode()).hexdigest()[:12]
    ledger = cache / f'reading-correction-{key}-{READING_OVERRIDE_SHA256}-{output_key}.json'
    active_path = cache / f'reading-active-{key}-{output_key}.json'
    active = read_reading_cache_record(active_path)
    certificate = read_reading_cache_record(ledger)
    published = read_reading_cache_record(output / 'manifest.json')
    if not (published and published.get('complete') and published.get('rendererSignature') == signature):
        published = None
    history = [record for path in cache.glob(f'reading-correction-{key}-*-{output_key}.json')
               if (record := read_reading_cache_record(path)) and record.get('complete')]

    def current(record):
        return bool(isinstance(record, dict) and record.get('complete')
                    and record.get('overrideSHA256') == READING_OVERRIDE_SHA256)

    # Keep track of earlier plan files too, so a later plan cannot resurrect an
    # old-config clip that was not required during the configuration switch.
    known_files = {filename for filename, _ in tasks}
    if active and isinstance(active.get('files'), list):
        known_files.update(filename for filename in active['files']
                           if isinstance(filename, str) and re.fullmatch(r'kokoro-[0-9a-f]{20}\.m4a', filename))
    if published and isinstance(published.get('files'), dict):
        known_files.update(path.removeprefix('/audio/') for path in published['files'].values()
                           if isinstance(path, str) and re.fullmatch(r'/audio/kokoro-[0-9a-f]{20}\.m4a', path))
    for record in history:
        changes = record.get('changes')
        known_files.update(change['file'] for change in (changes if isinstance(changes, list) else [])
                           if isinstance(change, dict) and isinstance(change.get('file'), str)
                           and re.fullmatch(r'kokoro-[0-9a-f]{20}\.m4a', change['file']))

    def activate(record):
        atomic_json(ledger, record)
        atomic_json(active_path, dict(version=1, rendererSignature=signature,
                    outputDirectory=output_directory, overrideSHA256=READING_OVERRIDE_SHA256,
                    files=sorted(known_files), certificate=record,
                    activatedAt=datetime.now(timezone.utc).isoformat()))
        return record

    def invalidate(reason, previous=None):
        invalidated = 0
        for filename in known_files:
            path = output / filename
            if path.exists():
                path.unlink()
                invalidated += 1
        record = dict(complete=True, overrideSHA256=READING_OVERRIDE_SHA256,
                      config=READING_OVERRIDE_CONFIG, source='override-configuration-change',
                      reason=reason, previousOverrideSHA256=previous, checkedClips=len(tasks),
                      changedClips=len(known_files), invalidatedClips=invalidated,
                      repairedAt=datetime.now(timezone.utc).isoformat())
        log('reading-cache-invalidated', reason=reason, invalidatedClips=invalidated,
            overrideSHA256=READING_OVERRIDE_SHA256)
        return activate(record)

    # The active marker is newer than a public manifest during an interrupted
    # new-config run. Historical per-config certificates never establish which
    # configuration produced the files currently occupying this namespace.
    if active_path.exists():
        if (active and active.get('rendererSignature') == signature
                and active.get('outputDirectory') == output_directory
                and active.get('overrideSHA256') == READING_OVERRIDE_SHA256
                and current(active.get('certificate'))):
            return activate(certificate if current(certificate) else active['certificate'])
        return invalidate('active-reading-configuration-changed', active.get('overrideSHA256') if active else None)
    if published:
        if published.get('pronunciationOverridesSHA256') == READING_OVERRIDE_SHA256:
            return activate(dict(complete=True, overrideSHA256=READING_OVERRIDE_SHA256,
                                 config=READING_OVERRIDE_CONFIG, source='complete-public-manifest',
                                 changedClips=0, invalidatedClips=0))
        return invalidate('published-reading-configuration-changed', published.get('pronunciationOverridesSHA256'))

    # The documented, unpublished bootstrap applied the precise glyph/guide
    # repair, followed by its exact quoted-quiz migration. Adopt the latest
    # matching certificate once;
    # future configuration changes must use the active marker above.
    bootstrap_sha256 = {
        '6ddb444e007bb8ba58addbbda604f3531c9188257a40f69f9e8dc9c62989e878',
        '5c2d67f5798bef5a15771be1e84a39e1d2a7cff0ec02ed6ccff26e1ac8940da5',
    }
    if (READING_OVERRIDE_SHA256 in bootstrap_sha256 and current(certificate)
            and certificate.get('source') == 'before-after-phoneme-diff'
            and certificate.get('config') == READING_OVERRIDE_CONFIG
            and isinstance(certificate.get('repairedAt'), str)
            and all(isinstance(record.get('repairedAt'), str)
                    and record['repairedAt'] <= certificate['repairedAt'] for record in history)):
        return activate(certificate)
    if history:
        return invalidate('legacy-reading-cache-without-active-marker')
    from misaki.zh import ZHG2P
    baseline = ZHG2P(version='1.1', en_callable=reject_english)
    corrected = course_g2p(baseline)
    changes = []
    invalidated = 0
    for filename, item in tasks:
        text = reading_text(item['spoken'])
        before, _ = baseline(text)
        after, _ = corrected(text)
        if before == after:
            continue
        changes.append(dict(file=filename, spoken=item['spoken'], beforePhonemes=before, afterPhonemes=after))
        path = output / filename
        if path.exists():
            path.unlink()
            invalidated += 1
    certificate = dict(complete=True, overrideSHA256=READING_OVERRIDE_SHA256,
                       config=READING_OVERRIDE_CONFIG, source='before-after-phoneme-diff',
                       checkedClips=len(tasks), changedClips=len(changes), invalidatedClips=invalidated,
                       changes=changes, repairedAt=datetime.now(timezone.utc).isoformat())
    log('reading-cache-repaired', changedClips=len(changes), invalidatedClips=invalidated,
        overrideSHA256=READING_OVERRIDE_SHA256)
    return activate(certificate)


def split_phonemes(text, g2p):
    """Preserve every character; recursively split at punctuation if needed."""
    phonemes, _ = g2p(text)
    if not phonemes.strip():
        raise ValueError(f'No phonemes for narration: {text}')
    if '❓' in phonemes:
        raise ValueError(f'Unknown phoneme in narration: {text}')
    if len(phonemes) <= 510:
        return [(text, phonemes)]
    boundaries = [m.end() for m in re.finditer(r'[。！？；，、：,.!?;:\s]', text)
                  if 0 < m.end() < len(text)]
    pivot = min(boundaries, key=lambda p: abs(p - len(text) / 2)) if boundaries else len(text) // 2
    if pivot <= 0:
        raise ValueError('An individual character exceeds the model token limit.')
    return split_phonemes(text[:pivot], g2p) + split_phonemes(text[pivot:], g2p)


def prepare_audio(audio, np):
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim != 1 or not len(audio) or not np.isfinite(audio).all():
        raise ValueError('Invalid waveform')
    peak = float(np.max(np.abs(audio)))
    if peak < 0.0001:
        raise ValueError('Silent waveform')
    active = np.flatnonzero(np.abs(audio) > 0.001)
    if active.size:
        # Retain quiet consonant attacks and word endings around detected speech.
        start = max(0, int(active[0]) - int(RATE * 0.08))
        end = min(len(audio), int(active[-1]) + int(RATE * 0.12) + 1)
        audio = audio[start:end].copy()
    if peak > 0.98:
        audio *= 0.98 / peak
    fade = min(int(RATE * 0.005), len(audio) // 2)
    if fade:
        ramp = np.linspace(0, 1, fade, dtype=np.float32)
        audio[:fade] *= ramp
        audio[-fade:] *= ramp[::-1]
    return audio


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, default=ROOT / '.audio-cache/kokoro/model')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/audio')
    parser.add_argument('--plan', type=Path, help='Optional JSON from export-audio-plan.mjs')
    parser.add_argument('--voice', choices=['zf_001', 'zf_002'], default='zf_001')
    parser.add_argument('--speed', type=float, default=0.85)
    parser.add_argument('--device', choices=['cpu', 'mps'], default='cpu')
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--workers', type=int, default=1, help='Independent CPU synthesis processes')
    parser.add_argument('--shards', type=int, default=1, help=argparse.SUPPRESS)
    parser.add_argument('--shard-index', type=int, default=0, help=argparse.SUPPRESS)
    parser.add_argument('--limit', type=int, help='Generate at most this many unique clips; keep manifest private')
    parser.add_argument('--samples', action='store_true', help='Generate a small listening and throughput sample set')
    args = parser.parse_args()
    if not 0.5 <= args.speed <= 1.5 or args.threads < 1 or args.workers < 1 or (args.limit is not None and args.limit < 1):
        parser.error('Speed must be 0.5–1.5; threads and limit must be positive.')
    if args.shards < 1 or not 0 <= args.shard_index < args.shards:
        parser.error('Invalid worker partition.')
    if args.workers > 1 and (args.samples or args.limit is not None or args.device != 'cpu' or args.shards > 1):
        parser.error('Multiple workers require a full CPU run.')
    args.model_dir = args.model_dir.resolve()
    args.output_dir = args.output_dir.resolve()
    if args.samples and args.output_dir == (ROOT / 'public/audio').resolve():
        parser.error('Samples require a separate --output-dir.')
    cache = ROOT / '.audio-cache/kokoro'
    cache.mkdir(parents=True, exist_ok=True)
    # Isolate all public-library caches from the user credential configuration.
    os.environ['HF_HOME'] = str(cache / 'hf')
    os.environ['HF_HUB_CACHE'] = str(cache / 'hf/hub')
    os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
    for key in ['HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN', 'DASHSCOPE_API_KEY', 'QWEN_API_KEY', 'OPENAI_API_KEY']:
        os.environ.pop(key, None)
    download_model(args.model_dir, args.voice)
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KModel, KPipeline
    torch.set_num_threads(args.threads)
    if args.device == 'mps' and not torch.backends.mps.is_available():
        raise ValueError('MPS is not available on this computer.')
    plan = json.loads(args.plan.read_text()) if args.plan else export_plan()
    if args.samples:
        examples = [
            '妈', '小花', '小朋友，跟我一起读。太阳出来了，照得大地暖暖的。',
            '找对啦！小花在阳光下慢慢长大。你说得真认真。',
            '床前明月光，疑是地上霜。举头望明月，低头思故乡。',
            '妈妈把西瓜切成小块。我背着小书包走进幼儿园。',
            '声母b，听起来像波。', '韵母üe，听起来像约。',
            max(plan['entries'], key=lambda item: len(item['spoken']))['spoken'],
        ]
        plan = {'entries': [dict(text=text, spoken=text, kind='listening-sample') for text in examples],
                'planSHA256': None}
    signature = json.dumps({
        'renderer': 'kokoro-local-v1', 'model': REPO, 'revision': REVISION,
        'modelSHA256': MODEL_SHA256, 'configSHA256': digest(args.model_dir / 'config.json'),
        'voice': args.voice, 'voiceSHA256': digest(args.model_dir / f'voices/{args.voice}.pt'),
        'kokoro': version('kokoro'), 'misaki': version('misaki'), 'torch': version('torch'),
        'speed': args.speed, 'sampleRate': RATE, 'bitrate': 48000,
        'processing': 'retain-80ms-120ms-threshold0.001-fade5ms-peak0.98-v1',
        'readingAdapter': 'chinese-pinyin-cues-v1', 'chunking': 'phoneme510-punctuation-recursive-v1',
    }, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    signature_key = hashlib.sha256(signature.encode()).hexdigest()[:20]
    grouped = OrderedDict()
    manifest = dict(version=2, renderer='kokoro-local', rendererSignature=signature,
                    filePrefix=PREFIX, hashAlgorithm='sha256-renderer-null-spoken-v1',
                    model=REPO, modelRevision=REVISION, modelSHA256=MODEL_SHA256,
                    modelLicense='Apache-2.0', voice=args.voice, lang='zh-CN', rate=args.speed,
                    pronunciationOverridesSHA256=READING_OVERRIDE_SHA256,
                    pronunciationOverrides=READING_OVERRIDE_CONFIG,
                    defaultPlaybackRate=1.0, format='aac-m4a', generatedAt=datetime.now(timezone.utc).isoformat(),
                    complete=False, total=len(plan['entries']), planSHA256=plan['planSHA256'], files={},
                    pronunciationReview='Chinese frontend with polyphonic reading context. Structural checks do not replace listening review.')
    for entry in plan['entries']:
        # Normalize before any synthesis so unsupported labels fail early.
        reading_text(entry['spoken'])
        key = hashlib.sha256((signature + '\0' + entry['spoken']).encode()).hexdigest()[:20]
        filename = f'{PREFIX}{key}.m4a'
        item = grouped.setdefault(filename, dict(spoken=entry['spoken'], texts=[], kind=entry['kind']))
        item['texts'].append(entry['text'])
        manifest['files'][entry['text']] = f'/audio/{filename}'
    all_tasks = list(grouped.items())
    tasks = all_tasks[args.shard_index::args.shards]
    manifest['uniqueRequiredFiles'] = len(all_tasks)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_suffix = f'-worker{args.shard_index}' if args.shards > 1 else ''
    checkpoint = cache / f'progress-{signature_key}{checkpoint_suffix}.json'
    log('plan', texts=len(plan['entries']), uniqueClips=len(tasks), characters=sum(len(item['spoken']) for _, item in tasks),
        device=args.device, threads=args.threads, speed=args.speed, voice=args.voice, signature=signature_key)
    if args.shards == 1:
        certificate = ensure_corrected_cache(args.output_dir, all_tasks, signature, cache)
        manifest['pronunciationCacheCorrection'] = {k: v for k, v in certificate.items()
                                                   if k not in ['changes', 'config']}
    if args.workers > 1:
        # Each child receives the same stable plan and a disjoint set of spoken
        # hashes. Only this coordinator may finalize the public manifest.
        snapshot = cache / f'plan-{plan["planSHA256"]}.json'
        atomic_json(snapshot, plan)
        children = []
        try:
            for worker in range(args.workers):
                command = [sys.executable, str(Path(__file__).resolve()), '--model-dir', str(args.model_dir),
                           '--output-dir', str(args.output_dir), '--plan', str(snapshot), '--voice', args.voice,
                           '--speed', str(args.speed), '--device', 'cpu', '--threads', str(args.threads),
                           '--shards', str(args.workers), '--shard-index', str(worker)]
                children.append(subprocess.Popen(command, cwd=ROOT))
            log('workers-started', workers=args.workers, clips=len(all_tasks))
            for child in children:
                if child.wait() != 0:
                    raise RuntimeError('A synthesis worker failed. Valid clips are retained for resuming.')
        finally:
            for child in children:
                if child.poll() is None:
                    child.terminate()
            for child in children:
                if child.poll() is None:
                    child.wait()
    load_started = time.monotonic()
    model = KModel(repo_id=REPO, config=str(args.model_dir / 'config.json'),
                   model=str(args.model_dir / 'kokoro-v1_1-zh.pth')).to(args.device).eval()
    pipeline = KPipeline(lang_code='z', repo_id=REPO, model=model, en_callable=reject_english)
    pipeline.g2p = course_g2p(pipeline.g2p)
    pipeline.voices[args.voice] = torch.load(args.model_dir / f'voices/{args.voice}.pt', map_location='cpu', weights_only=True)
    log('loaded', seconds=round(time.monotonic() - load_started, 2))
    started = time.monotonic()
    generated = resumed = 0
    seconds = 0.0
    records = []
    last_progress = started
    maximum = min(args.limit or len(tasks), len(tasks))
    with tempfile.TemporaryDirectory(prefix='ziyou-kokoro-encode-') as temporary:
        wav = Path(temporary) / 'clip.wav'
        encoded = Path(temporary) / 'clip.m4a'
        for index, (filename, item) in enumerate(tasks[:maximum]):
            destination = args.output_dir / filename
            duration = is_valid(destination)
            if duration:
                resumed += 1
            else:
                task_started = time.monotonic()
                text = reading_text(item['spoken'])
                segments = split_phonemes(text, pipeline.g2p)
                chunks = []
                with torch.inference_mode():
                    for segment_index, (graphemes, phonemes) in enumerate(segments):
                        output = list(pipeline.generate_from_tokens(phonemes, voice=args.voice, speed=args.speed))
                        if len(output) != 1 or output[0].audio is None:
                            raise ValueError('Synthesis did not return exactly one complete segment.')
                        audio = prepare_audio(output[0].audio.detach().cpu().numpy(), np)
                        if chunks:
                            pause = 0.18 if re.search(r'[。！？.!?]\s*$', segments[segment_index - 1][0]) else 0.10
                            chunks.append(np.zeros(int(RATE * pause), dtype=np.float32))
                        chunks.append(audio)
                audio = prepare_audio(np.concatenate(chunks), np)
                sf.write(wav, audio, RATE, subtype='PCM_16')
                encoded.unlink(missing_ok=True)
                subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '48000', str(wav), str(encoded)],
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                duration = inspect_aac(encoded)
                if abs(duration - len(audio) / RATE) > 0.25:
                    raise ValueError('AAC duration differs unexpectedly from the complete waveform.')
                os.replace(encoded, destination)
                generated += 1
                record = dict(file=filename, text=item['spoken'], characters=len(item['spoken']), segments=len(segments),
                              audioSeconds=round(duration, 3), wallSeconds=round(time.monotonic() - task_started, 3))
                if args.samples:
                    records.append(record)
                    log('sample', **record, path=str(destination))
            seconds += duration
            now = time.monotonic()
            if index == 0 or index + 1 == maximum or index % 100 == 99 or now - last_progress >= 30:
                elapsed = now - started
                manifest['validatedClips'] = index + 1
                atomic_json(checkpoint, dict(manifest=manifest, generated=generated, resumed=resumed,
                                            elapsedSeconds=round(elapsed, 2), recordedSeconds=round(seconds, 2),
                                            outputDirectory=str(args.output_dir)))
                log('progress', validated=index + 1, total=len(tasks), generated=generated, resumed=resumed,
                    elapsedSeconds=round(elapsed, 1), recordedSeconds=round(seconds, 1),
                    remainingSeconds=round((len(tasks) - index - 1) * elapsed / generated) if generated else None)
                last_progress = now
    elapsed = time.monotonic() - started
    if args.samples:
        atomic_json(args.output_dir / 'sample-report.json', dict(rendererSignature=signature, device=args.device,
                    seconds=round(elapsed, 2), recordedSeconds=round(seconds, 2), samples=records))
    elif args.shards == 1 and args.limit is None and maximum == len(tasks):
        if export_plan()['planSHA256'] != plan['planSHA256']:
            raise ValueError('The source narration plan changed during generation. Rerun to fill the updated plan.')
        # Validate the entire exact renderer set before atomically exposing it.
        for filename, _ in tasks:
            inspect_aac(args.output_dir / filename)
        manifest['complete'] = True
        manifest['completedAt'] = datetime.now(timezone.utc).isoformat()
        manifest.pop('validatedClips', None)
        atomic_json(args.output_dir / 'manifest.json', manifest)
        atomic_json(checkpoint, dict(manifest=manifest, generated=generated, resumed=resumed,
                                    elapsedSeconds=round(elapsed, 2), recordedSeconds=round(seconds, 2)))
    log('complete', complete=manifest['complete'], generated=generated, resumed=resumed,
        elapsedSeconds=round(elapsed, 2), recordedSeconds=round(seconds, 2), checkpoint=str(checkpoint))


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log('interrupted', message='Validated clips are retained; rerun the same command to resume.')
        sys.exit(130)
