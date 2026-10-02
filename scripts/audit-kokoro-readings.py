#!/usr/bin/env python3
"""Audit course readings in the same Python environment as the generator.

Targets come from the written course pinyin, rather than the generator's
override table. This checks actual frontend phonemes, not listening quality.
"""
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('narration_generator', ROOT / 'scripts/build-kokoro-audio.py')
narration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(narration)
from misaki.zh import ZHG2P
from misaki.zh_frontend import ZH_MAP
from pypinyin.contrib.tone_convert import to_initials, to_finals_tone3

CONTEXTS = [
    '长大', '长着羽毛', '长出新叶', '小种子', '种子', '孩子', '子女', '调整', '调动',
    '相似', '似的', '尽力', '尽量', '倒下', '倒水', '弹琴', '子弹', '佛像', '仿佛',
    '大地', '慢慢地', '率领', '长绳', '每一个', '得到', '走过',
]
ADDITIONAL_CONTEXTS = [
    '成为', '因为', '教书', '教室', '处理', '到处', '切开', '一切', '划船', '计划',
    '高兴', '兴起', '北斗', '斗争', '率领', '效率', '背包', '背面',
]
QUIZ_FORMS = ['“{glyph}”是什么意思？', '哪个词里有“{glyph}”？']
HAN = r'[\u3400-\u9fff\U00020000-\U0002ffff]'
SYLLABLE = r'[^\d\s/.,!?;:“”()]+[1-5]'


def lexical_phonemes(pinyin):
    """Encode a written lexical syllable without consulting a word dictionary."""
    initial = to_initials(pinyin)
    final = to_finals_tone3(pinyin, neutral_tone_with_five=True)
    if re.fullmatch(r'i[1-5]', final):
        if initial in ['z', 'c', 's']:
            final = 'ii' + final[-1]
        elif initial in ['zh', 'ch', 'sh', 'r']:
            final = 'iii' + final[-1]
    return (ZH_MAP[initial] if initial else '') + ZH_MAP[final[:-1]] + final[-1]


base = ZHG2P(version='1.1', en_callable=narration.reject_english)
phonemize = narration.course_g2p(base)
plan = narration.export_plan()
by_text = {entry['text']: entry for entry in plan['entries']}
words = json.loads((ROOT / 'src/data/hanzi.json').read_text())
mismatches, sandhi, quiz_errors = [], [], []
checked_quizzes = 0
for word in words:
    glyph, target = word['char'], word['pinyin']
    expected = lexical_phonemes(target)
    spoken = by_text[glyph]['spoken']
    actual, _ = phonemize(narration.reading_text(spoken))
    syllables = re.findall(SYLLABLE, actual)
    letters = re.findall(HAN, spoken)
    assert len(syllables) == len(letters) and glyph in letters, (glyph, spoken, actual)
    index = letters.index(glyph)
    surface = syllables[index]
    accepted = (glyph, spoken) in [('只', '只有'), ('处', '处理')] and (
        expected.endswith('3') and surface == expected[:-1] + '2'
        and index + 1 < len(syllables) and syllables[index + 1].endswith('3'))
    if accepted:
        sandhi.append(dict(char=glyph, target=target, spoken=spoken, surfacePhonemes=actual,
                           reason='Third tone becomes second tone before another third tone.'))
    elif surface != expected:
        mismatches.append(dict(char=glyph, target=target, spoken=spoken,
                               expectedPhonemes=expected, actualPhonemes=actual))
    for form in QUIZ_FORMS:
        text = form.format(glyph=glyph)
        quiz, _ = phonemize(narration.reading_text(by_text[text]['spoken']))
        quoted = re.search(r'“([^”]+)”', quiz)
        checked_quizzes += 1
        if quoted is None or quoted[1] != expected:
            quiz_errors.append(dict(text=text, target=target, expectedPhonemes=expected,
                                    actualPhonemes=quiz))


def contexts(texts):
    records = []
    for text in texts:
        before, _ = base(narration.reading_text(text))
        after, _ = phonemize(narration.reading_text(text))
        records.append(dict(text=text, beforePhonemes=before, afterPhonemes=after, unchanged=before == after))
        assert before == after or text == '长绳', text
    return records


unrecognized = [e['text'] for e in plan['entries'] if e['kind'] == 'quiz-prompt'
                and not re.fullmatch(r'“([^”])”是什么意思？|哪个词里有“([^”])”？', e['text'])]
report = dict(checkedAt=datetime.now(timezone.utc).isoformat(), planSHA256=plan['planSHA256'],
              modelRevision=narration.REVISION, voice='zf_001', checkedHanziTargets=len(words),
              matchingHanziTargets=len(words)-len(mismatches), targetMismatches=mismatches,
              acceptedToneSandhi=sandhi, checkedQuotedQuizTemplates=checked_quizzes,
              quotedQuizMismatches=quiz_errors, unrecognizedHanziQuizTemplates=unrecognized,
              quotedQuizOverrideGlyphs=len(narration.QUOTED_QUIZ_READINGS),
              overrideSHA256=narration.READING_OVERRIDE_SHA256,
              overrideConfig=narration.READING_OVERRIDE_CONFIG,
              contextSpotChecks=contexts(CONTEXTS), additionalQuotedGlyphContexts=contexts(ADDITIONAL_CONTEXTS),
              boundary='Compares the target glyph syllable in actual character narration and both exact quoted quiz templates against written course pinyin. Checks preserved word contexts; it does not grade recordings by listening or establish every poetry pronunciation.')
output = ROOT / 'scripts/verification/kokoro-reading-audit.json'
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['checkedHanziTargets', 'matchingHanziTargets',
                 'targetMismatches', 'checkedQuotedQuizTemplates', 'quotedQuizMismatches',
                 'unrecognizedHanziQuizTemplates', 'overrideSHA256']}, ensure_ascii=False))
raise SystemExit(1 if mismatches or quiz_errors or unrecognized else 0)
