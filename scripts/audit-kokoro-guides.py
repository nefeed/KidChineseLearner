#!/usr/bin/env python3
"""Check the actual Mandarin frontend used for the course's pinyin cues.

Run in the same Python environment as build-kokoro-audio.py. This checks
phonemes and written targets; it is not a listening or phonetic grading test.
"""
import importlib.util
import json
from pathlib import Path
import re
import unicodedata
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('narration_generator', ROOT / 'scripts/build-kokoro-audio.py')
narration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(narration)
from misaki.zh import ZHG2P

base = ZHG2P(version='1.1', en_callable=narration.reject_english)
phonemize = narration.course_g2p(base)
plan = narration.export_plan()
words = {w['char']: w for w in json.loads((ROOT / 'src/data/hanzi.json').read_text())}
initial_symbols = {'zh':'ㄓ', 'ch':'ㄔ', 'sh':'ㄕ', 'r':'ㄖ', 'z':'ㄗ', 'c':'ㄘ', 's':'ㄙ'}
initial_targets = {
    'b':'ㄅㄛ1', 'p':'ㄆㄛ1', 'm':'ㄇㄛ1', 'f':'ㄈㄛ2', 'd':'ㄉㄜ2',
    't':'ㄊㄜ4', 'n':'ㄋㄜ5', 'l':'ㄌㄜ4', 'g':'ㄍㄜ1', 'k':'ㄎㄜ1',
    'h':'ㄏㄜ1', 'j':'ㄐㄧ1', 'q':'ㄑㄧ1', 'x':'ㄒㄧ1', 'zh':'ㄓ十1',
    'ch':'ㄔ十1', 'sh':'ㄕ十1', 'r':'ㄖ十4', 'z':'ㄗㄭ1', 'c':'ㄘㄭ2',
    's':'ㄙㄭ1', 'y':'ㄧ1', 'w':'ㄨ1',
}
# These are the first Chinese reading cues, not isolated-consonant claims.
final_targets = {
    'a':'ㄚ5', 'o':'ㄛ5', 'e':'ㄜ2', 'i':'ㄧ1', 'u':'ㄨ1', 'ü':'ㄩ1',
    'ai':'ㄞ1', 'ei':'ㄟ5', 'ao':'ㄠ1', 'ou':'ㄡ1', 'an':'ㄢ1', 'en':'ㄣ1',
    'ang':'ㄤ2', 'eng':'ㄏㄥ1', 'ong':'瓮1', 'ia':'压5', 'ie':'ㄝ5',
    'iao':'要1', 'iu':'又1', 'iou':'又1', 'ian':'言1', 'in':'阴1',
    'iang':'阳1', 'ing':'应1', 'iong':'用1', 'ua':'穵1', 'uo':'我1',
    'uai':'外1', 'ui':'为1', 'uei':'为1', 'uan':'万1', 'un':'文1',
    'uen':'文1', 'uang':'王1', 'ueng':'瓮1', 'er':'ㄦ2', 'üe':'月1',
    'ue':'月1', 'üan':'元1', 'ün':'云1',
}

def apical_target(char):
    decomposition = unicodedata.normalize('NFD', words[char]['pinyin'])
    tone = next((str(i + 1) for i, mark in enumerate(['\u0304', '\u0301', '\u030c', '\u0300']) if mark in decomposition), '5')
    stem = ''.join(c for c in decomposition if not unicodedata.combining(c))
    initial = stem[:-1]
    assert stem.endswith('i') and initial in initial_symbols, (char, stem)
    return initial_symbols[initial] + ('ㄭ' if initial in ['z','c','s'] else '十') + tone

records = []
errors = []
for entry in plan['entries']:
    if entry['kind'] != 'pinyin-guide':
        continue
    text = entry['spoken']
    phones, _ = phonemize(narration.reading_text(text))
    compact = re.sub(r'[\s/]', '', phones)
    if text.startswith('这是舌尖韵母，跟着读'):
        char = text[-2]
        expected = apical_target(char)
        matches = compact.endswith(expected + '.')
    else:
        category, spelling = re.match(r'(声母|韵母)([a-zü]+)', text).groups()
        expected = (initial_targets if category == '声母' else final_targets)[spelling]
        prefix = 'ㄕㄥ1ㄇㄨ3' if category == '声母' else '云4ㄇㄨ3'
        # er must be an independent syllable; 韵母儿 must not become 母儿化.
        matches = compact.startswith(prefix + expected)
    record = dict(text=text, phonemes=phones, expectedCue=expected, matches=matches)
    records.append(record)
    if not matches or '❓' in phones:
        errors.append(record)
report = dict(checkedAt=datetime.now(timezone.utc).isoformat(), planSHA256=plan['planSHA256'],
              overrideSHA256=narration.READING_OVERRIDE_SHA256, checkedGuides=len(records),
              latinGuides=sum(not r['text'].startswith('这是舌尖') for r in records),
              apicalGuides=sum(r['text'].startswith('这是舌尖') for r in records),
              errors=errors, records=records,
              boundary='Checks frontend syllables in reading cues, not auditory quality or isolated phoneme articulation.')
output = ROOT / 'scripts/verification/kokoro-guide-audit.json'
output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({k:v for k,v in report.items() if k != 'records'}, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
