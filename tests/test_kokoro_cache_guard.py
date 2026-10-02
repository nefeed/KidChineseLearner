"""Exercise cache migration with isolated files and fixture bytes.

The baseline case uses a minimal G2P stub to check invalidation, not real
pronunciation. No waveform synthesis or production cache access is required.
"""

import copy
import hashlib
import json
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build-kokoro-audio.py'

# Immutable first-publication fixture; later production reading changes must
# still exercise the original bootstrap migration.
BOOTSTRAP_CONFIG = {'version': 1,
 'scope': ['standalone-course-glyph',
           'glyph-before-full-stop',
           'exact-read-as-feedback',
           'exact-pinyin-teaching-template'],
 'primaryReadings': {'长': {'pinyin': 'cháng', 'phonemes': 'ㄔㄤ2'},
                     '地': {'pinyin': 'dì', 'phonemes': 'ㄉㄧ4'},
                     '子': {'pinyin': 'zǐ', 'phonemes': 'ㄗㄭ3'},
                     '调': {'pinyin': 'tiáo', 'phonemes': 'ㄊ要2'},
                     '似': {'pinyin': 'sì', 'phonemes': 'ㄙㄭ4'},
                     '尽': {'pinyin': 'jìn', 'phonemes': 'ㄐ阴4'},
                     '倒': {'pinyin': 'dǎo', 'phonemes': 'ㄉㄠ3'},
                     '弹': {'pinyin': 'tán', 'phonemes': 'ㄊㄢ2'},
                     '佛': {'pinyin': 'fó', 'phonemes': 'ㄈㄛ2'},
                     '个': {'pinyin': 'gè', 'phonemes': 'ㄍㄜ4'},
                     '得': {'pinyin': 'dé', 'phonemes': 'ㄉㄜ2'},
                     '过': {'pinyin': 'guò', 'phonemes': 'ㄍ我4'}},
 'teachingTemplates': {'声母佛，听起来像佛。': {'before': '声母', 'glyph': '佛', 'middle': '，听起来像'},
                       '声母得，听起来像得。': {'before': '声母', 'glyph': '得', 'middle': '，听起来像'},
                       '声母勒，听起来像勒。': {'before': '声母',
                                      'glyph': '勒',
                                      'middle': '，听起来像',
                                      'phonemes': 'ㄌㄜ4'},
                       '韵母儿，听起来像耳。': {'before': '韵母',
                                      'glyph': '儿',
                                      'middle': '，听起来像',
                                      'phonemes': 'ㄦ2',
                                      'secondPhonemes': 'ㄦ3'},
                       '韵母儿，听起来像二。': {'before': '韵母',
                                      'glyph': '儿',
                                      'middle': '，听起来像',
                                      'phonemes': 'ㄦ2',
                                      'secondPhonemes': 'ㄦ4'},
                       '韵母儿，听起来像而。': {'before': '韵母',
                                      'glyph': '儿',
                                      'middle': '，听起来像',
                                      'phonemes': 'ㄦ2',
                                      'secondPhonemes': 'ㄦ2'},
                       '韵母儿，听起来像儿。': {'before': '韵母',
                                      'glyph': '儿',
                                      'middle': '，听起来像',
                                      'phonemes': 'ㄦ2',
                                      'secondPhonemes': 'ㄦ2'},
                       '韵母儿，听起来像尔。': {'before': '韵母',
                                      'glyph': '儿',
                                      'middle': '，听起来像',
                                      'phonemes': 'ㄦ2',
                                      'secondPhonemes': 'ㄦ3'},
                       '这是舌尖韵母，跟着读子。': {'before': '这是舌尖韵母，跟着读', 'glyph': '子'},
                       '这是舌尖韵母，跟着读似。': {'before': '这是舌尖韵母，跟着读', 'glyph': '似'}},
 'verifiedWordReading': {'长绳': 'cháng shéng'},
 'contextPolicy': 'All other contexts use the unmodified Misaki phrase dictionary and tone sandhi.'}


class CacheGuardTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ziyou-reading-guard-')
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.output, self.cache = root / 'audio', root / 'cache'
        self.output.mkdir()
        self.cache.mkdir()
        namespace = runpy.run_path(str(SCRIPT), run_name='guard_regression')
        self.guard = namespace['ensure_corrected_cache']
        self.globals = self.guard.__globals__
        self.globals['log'] = lambda *args, **kwargs: None
        self.original_config = copy.deepcopy(BOOTSTRAP_CONFIG)
        self.original_sha = hashlib.sha256(json.dumps(BOOTSTRAP_CONFIG, ensure_ascii=False,
                                          sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.globals['READING_OVERRIDE_CONFIG'] = copy.deepcopy(BOOTSTRAP_CONFIG)
        self.globals['READING_OVERRIDE_SHA256'] = self.original_sha
        self.globals['PRIMARY_READING_OVERRIDES'] = copy.deepcopy(BOOTSTRAP_CONFIG['primaryReadings'])
        self.globals['EXACT_TEACHING_TEMPLATES'] = copy.deepcopy(BOOTSTRAP_CONFIG['teachingTemplates'])
        self.signature = 'same-official-renderer-fp32-voice-zf001-speed085'
        self.key = hashlib.sha256(self.signature.encode()).hexdigest()[:20]
        self.output_key = hashlib.sha256(str(self.output.resolve()).encode()).hexdigest()[:12]
        self.tasks = [(self.filename(text), {'spoken': text}) for text in ['长', '花']]
        self.long, self.flower = [self.output / filename for filename, _ in self.tasks]
        self.unrelated = self.output / 'kokoro-ffffffffffffffffffff.m4a'
        self.unrelated.write_bytes(b'other renderer audio')

    def filename(self, spoken):
        key = hashlib.sha256((self.signature + '\0' + spoken).encode()).hexdigest()[:20]
        return f'kokoro-{key}.m4a'

    def config(self, primary):
        value = {'version': 1, 'primaryReadings': primary}
        self.globals['READING_OVERRIDE_CONFIG'] = value
        self.globals['PRIMARY_READING_OVERRIDES'] = primary
        self.globals['EXACT_TEACHING_TEMPLATES'] = {}
        sha = hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.globals['READING_OVERRIDE_SHA256'] = sha
        return sha

    def config_a(self):
        return self.config({'长': {'pinyin': 'cháng', 'phonemes': 'ㄔㄤ2'}})

    def write_audio(self, label):
        self.long.write_bytes(label.encode())
        self.flower.write_bytes(label.encode())

    def publish(self, sha):
        value = {'complete': True, 'rendererSignature': self.signature,
                 'pronunciationOverridesSHA256': sha,
                 'files': {item['spoken']: f'/audio/{filename}' for filename, item in self.tasks}}
        (self.output / 'manifest.json').write_text(json.dumps(value))

    def ledger(self, sha):
        return self.cache / f'reading-correction-{self.key}-{sha}-{self.output_key}.json'

    def certificate(self, sha, config, repaired='2026-10-02T08:53:20.663314+00:00'):
        value = {'complete': True, 'overrideSHA256': sha, 'config': config,
                 'source': 'before-after-phoneme-diff', 'checkedClips': 22453,
                 'changedClips': 49, 'invalidatedClips': 39, 'changes': [], 'repairedAt': repaired}
        self.ledger(sha).write_text(json.dumps(value, ensure_ascii=False))
        return value

    def run_guard(self, tasks=None):
        return self.guard(self.output, self.tasks if tasks is None else tasks, self.signature, self.cache)

    def active(self):
        return json.loads(next(self.cache.glob('reading-active-*.json')).read_text())

    def establish_a(self):
        sha = self.config_a()
        self.write_audio('A corrected cháng')
        self.publish(sha)
        self.assertEqual(self.run_guard()['invalidatedClips'], 0)
        return sha

    def test_deleting_override_invalidates_old_recording(self):
        self.establish_a()
        sha_b = self.config({})
        result = self.run_guard()
        self.assertEqual(result['invalidatedClips'], 2)
        self.assertFalse(self.long.exists())
        self.assertFalse(self.flower.exists())
        self.assertEqual(self.active()['overrideSHA256'], sha_b)
        self.assertEqual(self.unrelated.read_bytes(), b'other renderer audio')

    def test_A_B_A_ignores_historical_A_certificate(self):
        sha_a = self.establish_a()
        sha_b = self.config({})
        self.run_guard()
        self.write_audio('B baseline zhǎng')
        self.publish(sha_b)
        self.assertTrue(self.ledger(sha_a).exists())
        self.assertEqual(self.config_a(), sha_a)
        self.assertEqual(self.run_guard()['invalidatedClips'], 2)
        self.assertFalse(self.long.exists())
        self.assertEqual(self.active()['overrideSHA256'], sha_a)

    def test_same_config_resume_keeps_partial_new_audio_with_old_public_manifest(self):
        sha_a = self.establish_a()
        sha_b = self.config({})
        self.run_guard()
        self.write_audio('B partial generation')
        self.assertEqual(json.loads((self.output / 'manifest.json').read_text())['pronunciationOverridesSHA256'], sha_a)
        self.run_guard()
        self.assertEqual(self.long.read_bytes(), b'B partial generation')
        self.assertEqual(self.flower.read_bytes(), b'B partial generation')
        self.assertEqual(self.active()['overrideSHA256'], sha_b)

    def test_bootstrap_6ddb_preserves_prepublication_clips(self):
        self.assertEqual(self.original_sha, '6ddb444e007bb8ba58addbbda604f3531c9188257a40f69f9e8dc9c62989e878')
        old_sha = '112eaa740093e7523d89ef6a60103e0e1cce51744c45032776618c90cbb7feef'
        self.certificate(old_sha, {'version': 1}, '2026-10-02T08:25:38.868912+00:00')
        expected = self.certificate(self.original_sha, self.original_config)
        (self.output / 'manifest.json').write_text(json.dumps({'complete': True, 'voice': 'Tingting'}))
        self.write_audio('current 6ddb bootstrap audio')
        self.assertEqual(self.run_guard(), expected)
        self.assertEqual(self.long.read_bytes(), b'current 6ddb bootstrap audio')
        self.assertEqual(self.flower.read_bytes(), b'current 6ddb bootstrap audio')
        self.assertEqual(self.active()['overrideSHA256'], self.original_sha)
        self.run_guard()
        self.assertEqual(self.long.read_bytes(), b'current 6ddb bootstrap audio')

    def test_bootstrap_does_not_trust_an_older_certificate_after_another_configuration(self):
        self.certificate(self.original_sha, self.original_config)
        self.certificate('newer-other-configuration', {'version': 2}, '2026-10-02T09:53:20.663314+00:00')
        self.write_audio('different later config')
        self.assertEqual(self.run_guard()['invalidatedClips'], 2)
        self.assertFalse(self.long.exists())

    def test_legacy_matching_ledger_cannot_override_different_public_configuration(self):
        sha_a = self.config_a()
        self.certificate(sha_a, self.globals['READING_OVERRIDE_CONFIG'])
        self.publish('different-B')
        self.write_audio('B audio')
        self.assertEqual(self.run_guard()['invalidatedClips'], 2)
        self.assertFalse(self.long.exists())

    def test_complete_current_manifest_can_initialize_marker_after_upgrade(self):
        sha = self.config_a()
        self.certificate('older-B', {'version': 2})
        self.write_audio('already published A')
        self.publish(sha)
        self.assertEqual(self.run_guard()['invalidatedClips'], 0)
        self.assertEqual(self.long.read_bytes(), b'already published A')
        self.assertEqual(self.active()['overrideSHA256'], sha)

    def test_switch_removes_old_plan_clip_that_is_no_longer_required(self):
        self.establish_a()
        self.config({})
        self.assertEqual(self.run_guard(tasks=self.tasks[:1])['invalidatedClips'], 2)
        self.assertFalse(self.flower.exists())
        self.assertTrue(self.unrelated.exists())

    def test_same_config_resume_can_restore_missing_ledger_from_active_marker(self):
        sha = self.establish_a()
        self.ledger(sha).unlink()
        self.run_guard()
        self.assertTrue(self.ledger(sha).exists())
        self.assertEqual(self.long.read_bytes(), 'A corrected cháng'.encode())

    def test_first_baseline_cache_still_uses_exact_phoneme_difference(self):
        self.config_a()
        self.write_audio('original baseline')
        package = types.ModuleType('misaki')
        package.__path__ = []
        zh = types.ModuleType('misaki.zh')
        def baseline(text):
            return {'长': 'ㄓㄤ3', '花': 'ㄏㄨㄚ1'}[text], None
        zh.ZHG2P = lambda **kwargs: baseline
        with patch.dict(sys.modules, {'misaki': package, 'misaki.zh': zh}):
            result = self.run_guard()
        self.assertEqual(result['changedClips'], 1)
        self.assertEqual(result['invalidatedClips'], 1)
        self.assertFalse(self.long.exists())
        self.assertEqual(self.flower.read_bytes(), b'original baseline')
        self.assertEqual(result['source'], 'before-after-phoneme-diff')


if __name__ == '__main__':
    unittest.main(verbosity=2)
