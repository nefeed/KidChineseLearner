#!/usr/bin/env python3
"""Bind the 300 editorial mappings and independent spotchecks to current output.

This is a reproducible evidence manifest, not a claim of expert teaching review.
Run after build-poems.py. --check compares the saved manifest without writing it.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import itertools
import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'scripts/poetry-source'
DATA = ROOT / 'src/data/poems.json'
OUTPUT = SOURCE / 'editorial-review-audit.json'

spec = importlib.util.spec_from_file_location('poetry_build', ROOT / 'scripts/build-poems.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

CANONICAL_TEXT_NOTES = {
    'poem-043': '储光羲洛阳道：呜玉珂校为鸣玉珂，保留原始快照。',
    'poem-181': '李益夜上受降城闻笛：清除上游混用左右括号的版本注记，采用完整四句。',
    'poem-244': '范成大霜天晓角：春折威据古集校为春威折。',
    'poem-271': '李清照醉花阴：把洒据原典校为把酒。',
    'poem-273': '叶梦得虞美人：补回底本缺漏的罥字。',
    'poem-277': '宋祁玉楼春：补回底本缺漏的縠字。',
    'poem-280': '李清照声声慢：旧字守著按现代助词规范为守着；整首仍完整。',
}
CANONICAL_EXTRA_REFERENCES = {
    'poem-043': 'https://zh.wikisource.org/wiki/全唐詩/卷139',
    'poem-181': 'https://zh.wikisource.org/wiki/夜上受降城聞笛',
}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def review_manifest():
    poems = json.loads(DATA.read_text())
    assert len(poems) == 300
    assert [p['id'] for p in poems] == [f'poem-{n:03d}' for n in range(1, 301)]
    assert all(p['reviewStatus'] == 'edited' for p in poems)
    # Check the actual exported data with a different Han implementation (Unicode
    # Script=Han), rather than only reusing the builder's character range.
    unicode_check = subprocess.run(
        ['node', '-e', "const p=require(process.argv[1]);let c=0;for(const x of p){if(x.lines.length!==x.pinyin.length)throw Error(x.id);for(let i=0;i<x.lines.length;i++){const n=[...x.lines[i].matchAll(/\\p{Script=Han}/gu)].length;if(n!==x.pinyin[i].length)throw Error(x.id+':'+i);c+=n}}console.log(c)", str(DATA)],
        capture_output=True, text=True, check=True)
    unicode_characters = int(unicode_check.stdout.strip())
    tang, song = generator.normalize_sources()
    original_works = tang + song
    text_index = {}
    for work in original_works:
        text_index.setdefault(generator.han(''.join(work['lines'])), []).append(work)

    spot_files = ['review-spotchecks-early.json', 'review-spotchecks-late.json']
    spotchecks = [json.loads((SOURCE / name).read_text()) for name in spot_files]
    spots = {r['id']: r for file in spotchecks for r in file['reviews']}
    assert len(spots) == 20
    # The independent reviewer recorded the earlier snapshot honestly. These
    # checks verify its concrete findings were applied, without rewriting history.
    by_id = {p['id']: p for p in poems}
    assert '朗中保留' not in by_id['poem-127']['background']
    assert by_id['poem-127']['backgroundSource'].endswith('李太白全集/卷二十三')
    for lesson_id in ['poem-137', 'poem-141', 'poem-152', 'poem-163', 'poem-208']:
        assert by_id[lesson_id]['backgroundSource'] == spots[lesson_id]['suggestedPatch']['backgroundSource']
    assert '并不是说真实鸳鸯' in by_id['poem-174']['interpretation'][0]
    assert '王世贞' not in by_id['poem-247']['background']
    assert by_id['poem-247']['backgroundSource'].endswith('耆舊續聞/卷二')
    assert '泪水研墨' in by_id['poem-269']['interpretation'][1]
    assert '水花' not in by_id['poem-274']['question']['explanation']
    assert '丁未年元日' in by_id['poem-299']['background']
    pinyin_verification = json.loads((SOURCE / 'pinyin-final-verification.json').read_text())
    assert pinyin_verification['dataSha256'] == hashlib.sha256(DATA.read_bytes()).hexdigest()
    assert pinyin_verification['summary']['present_and_matching'] == 85
    assert pinyin_verification['summary']['not_present'] == 0
    assert pinyin_verification['summary']['present_with_mismatch'] == 0

    rows = []
    for index, poem in enumerate(poems):
        if index < 40:
            mapping = generator.EDITED[index]
            origin = f'scripts/build-poems.py:EDITED[{index}]'
        elif index < 220:
            matches = [(key, value) for key, value in generator.CURRICULUM_EDITS.items()
                       if value['activity'] == poem['activity']]
            assert len(matches) == 1, (poem['id'], 'Missing or ambiguous editorial mapping')
            key, mapping = matches[0]
            origin = 'scripts/build-poems.py:CURRICULUM_EDITS[' + ' / '.join(key) + ']'
        else:
            mapping = generator.EXTERNAL_EDITS[poem['id']]
            origin = 'scripts/poetry-source/edits-221-300.json:edits.' + poem['id']
        assert mapping['reviewStatus'] == 'edited'
        assert poem['activity'] == mapping['activity']
        assert poem['question']['prompt'] == mapping['question']['prompt']
        assert poem['question']['options'][poem['question']['answer']] == mapping['question']['options'][0]
        assert poem['interpretation'] == mapping['interpretation'] or poem['id'] == 'poem-269'
        text = generator.han(''.join(poem['lines']))
        original_matches = text_index.get(text, [])
        if original_matches:
            source_status = 'exact-normalized-snapshot-text'
            matching = next((x for x in original_matches if x['author'] == poem['author']), original_matches[0])
            source_record = dict(title=matching['title'], author=matching['author'], source=matching['source'])
            source_note = ''
            assert matching['author'] == poem['author'] or poem['id'] == 'poem-133'
        elif poem['id'] in CANONICAL_TEXT_NOTES:
            source_status = 'documented-canonical-correction'
            source_record = dict(title=poem['title'], author=poem['author'], source=poem['backgroundSource'])
            if poem['id'] in CANONICAL_EXTRA_REFERENCES:
                source_record['correctionEvidence'] = CANONICAL_EXTRA_REFERENCES[poem['id']]
            source_note = CANONICAL_TEXT_NOTES[poem['id']]
        else:
            assert index < 40, (poem['id'], 'Undocumented source text change')
            source_status = 'opening-supplement-or-canonical-variant'
            source_record = dict(title=poem['title'], author=poem['author'], source=poem['backgroundSource'])
            source_note = '首批完整经典补充/通行字句，背景具体入口及来源文档保存核对依据。'
        if poem['id'] == 'poem-133':
            source_note = '上游误署杜牧；据苏轼书彭城观月诗的作者自述更正为苏轼阳关曲宋词。'
        spot = spots.get(poem['id'])
        rows.append(dict(id=poem['id'], title=poem['title'], author=poem['author'], dynasty=poem['dynasty'],
                         kind=poem['kind'], level=poem['level'], reviewStatus=poem['reviewStatus'],
                         editorialMapping=origin, mappingVerified=True,
                         textSha256=hashlib.sha256(text.encode()).hexdigest(),
                         currentRecordSha256=digest(poem), sourceStatus=source_status,
                         sourceRecord=source_record, sourceNote=source_note,
                         backgroundSource=poem['backgroundSource'],
                         independentSemanticSpotcheck=bool(spot),
                         reviewedSnapshotSha256=spot.get('snapshotSha256') if spot else None,
                         postReviewConcreteFixesVerified=bool(spot)))

    near_duplicates = []
    for a, b in itertools.combinations(poems, 2):
        ratio = generator.SequenceMatcher(None, generator.han(''.join(a['lines'])),
                                           generator.han(''.join(b['lines']))).ratio()
        if ratio > .88:
            near_duplicates.append(dict(ids=[a['id'], b['id']], ratio=ratio))
    assert not near_duplicates, near_duplicates
    unique_counts = {field: len({json.dumps(p[field], ensure_ascii=False) for p in poems})
                     for field in ['interpretation', 'background', 'activity']}
    unique_counts['questionPrompt'] = len({p['question']['prompt'] for p in poems})
    assert all(count == 300 for count in unique_counts.values())
    return dict(reviewedAt='2026-10-02', scope='all 300 editorial mappings plus 20 independent semantic spotchecks',
                dataSha256=hashlib.sha256(DATA.read_bytes()).hexdigest(),
                generatorSha256=hashlib.sha256((ROOT / 'scripts/build-poems.py').read_bytes()).hexdigest(),
                rawSnapshotSha256={name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest()
                                   for name in ['tang300.json', 'qianjiashi.json', 'song300.json']},
                externalPatchSha256=hashlib.sha256((SOURCE / 'edits-221-300.json').read_bytes()).hexdigest(),
                spotcheckFileSha256={name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in spot_files},
                pinyinVerificationSha256=hashlib.sha256((SOURCE / 'pinyin-final-verification.json').read_bytes()).hexdigest(),
                summary=dict(mappedRecords=300, editedRecords=300, independentSemanticSpotchecks=20,
                             sourceStatus=dict(Counter(x['sourceStatus'] for x in rows)),
                             unicodeScriptHanCharacters=unicode_characters,
                             emittedPinyinSyllables=sum(len(line) for p in poems for line in p['pinyin']),
                             uniqueContentCounts=unique_counts, nearDuplicatePairsAbove088=0,
                             externalContextPhrases=pinyin_verification['summary'],
                             allRecordedConcreteFindingsApplied=True),
                limits=['映射覆盖和独立字符计数为自动检查；文本唯一不证明每一句解释没有文学争议。',
                        '20首额外语义复查由不同内容编写助手交叉进行，并有逐篇原典证据；不是人类专家教学审核。',
                        '原始审查文件保留审查时的内容哈希，当前哈希与已落实的具体修正另行记录。',
                        '没有声称逐音试听完全部音频；古音和现代普通话读法政策见来源文档。'],
                records=rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    report = review_manifest()
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        assert OUTPUT.read_text() == encoded, 'Saved editorial review manifest is stale'
    else:
        OUTPUT.write_text(encoded)
    print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
