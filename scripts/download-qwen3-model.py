#!/usr/bin/env python3
"""Download pinned public Qwen3 MLX weights, without model API calls or tokens.

Large files use resumable HTTP ranges, then a full SHA256 verification. Only
model artifacts are downloaded; no course text is sent over the network.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import importlib.util
import os
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('qwen_narration', ROOT / 'scripts/build-qwen3-audio.py')
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
BASE = f'https://huggingface.co/{model.REPO}/resolve/{model.REVISION}/'
SMALL_FILES = ['README.md', 'config.json', 'generation_config.json', 'merges.txt',
    'model.safetensors.index.json', 'preprocessor_config.json', 'tokenizer_config.json', 'vocab.json',
    'speech_tokenizer/config.json', 'speech_tokenizer/configuration.json',
    'speech_tokenizer/preprocessor_config.json']
WEIGHTS = [('model.safetensors', model.MODEL_SHA256),
           ('speech_tokenizer/model.safetensors', model.TOKENIZER_SHA256)]


def request(name, byte_range=None):
    # Fresh redirects avoid resuming through expired CDN signed URLs.
    url = BASE + name + '?download=true&fresh=' + str(time.time_ns())
    headers = {'Range': f'bytes={byte_range[0]}-{byte_range[1]}'} if byte_range else {}
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60)


def download_weight(name, expected, directory, parts, workers):
    target = directory / name
    if target.exists() and model.digest(target) == expected:
        model.log('verified', file=name, sha256=expected)
        return
    with request(name, (0, 0)) as response:
        if response.status != 206:
            raise ValueError('Download server must support byte ranges')
        size = int(response.headers['Content-Range'].split('/')[-1])
    chunk = 32 * 1024 * 1024
    count = (size + chunk - 1) // chunk
    started = time.monotonic()

    def part_path(index):
        return parts / (name.replace('/', '_') + f'.{index}')

    def download_part(index):
        start, end = index * chunk, min(size, (index + 1) * chunk) - 1
        path = part_path(index)
        if path.exists() and path.stat().st_size == end - start + 1:
            return
        temporary = path.with_name(path.name + '.partial')
        for attempt in range(20):
            try:
                offset = temporary.stat().st_size if temporary.exists() else 0
                if offset > end - start + 1:
                    raise ValueError('Partial range exceeds expected size')
                if offset < end - start + 1:
                    with request(name, (start + offset, end)) as response:
                        if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start + offset}-{end}/{size}':
                            raise ValueError('Unexpected byte-range response')
                        with temporary.open('ab') as output:
                            while block := response.read(1024 * 1024):
                                output.write(block)
                if temporary.stat().st_size != end - start + 1:
                    raise ValueError('Incomplete range')
                os.replace(temporary, path)
                return
            except (OSError, ValueError) as error:
                if attempt == 19:
                    raise
                model.log('retry', file=name, part=index, attempt=attempt + 1, error=str(error))
                time.sleep(min(15, 2 + attempt * 3))

    model.log('download', file=name, bytes=size, parts=count)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for completed, future in enumerate(as_completed([pool.submit(download_part, i) for i in range(count)]), 1):
            future.result()
            model.log('progress', file=name, parts=completed, total=count,
                      seconds=round(time.monotonic() - started, 1))
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.partial')
    checksum = hashlib.sha256()
    with temporary.open('wb') as output:
        for index in range(count):
            with part_path(index).open('rb') as part:
                while data := part.read(1024 * 1024):
                    checksum.update(data)
                    output.write(data)
    if checksum.hexdigest() != expected:
        raise ValueError(f'{name} failed SHA256 verification; remove its cached parts and retry')
    os.replace(temporary, target)
    for index in range(count):
        part_path(index).unlink()
    model.log('verified', file=name, sha256=expected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-dir', type=Path, default=ROOT / '.audio-cache/qwen3/model')
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()
    if not 1 <= args.workers <= 24:
        parser.error('Use 1 to 24 download workers')
    args.model_dir.mkdir(parents=True, exist_ok=True)
    parts = args.model_dir.parent / 'parts'
    parts.mkdir(parents=True, exist_ok=True)
    for name in SMALL_FILES:
        target = args.model_dir / name
        target.parent.mkdir(parents=True, exist_ok=True)
        # Small artifacts always come from this revision, even if a previous
        # model happened to occupy the same user-supplied directory.
        with request(name) as response:
            data = response.read()
        temporary = target.with_name(target.name + '.partial')
        temporary.write_bytes(data)
        os.replace(temporary, target)
    for name, expected in WEIGHTS:
        download_weight(name, expected, args.model_dir, parts, args.workers)
    model.atomic_json(args.model_dir.parent / 'model-info.json',
                      dict(model=model.REPO, revision=model.REVISION))


if __name__ == '__main__':
    main()
