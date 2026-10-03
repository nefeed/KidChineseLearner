"""Offline release guards; no ML libraries, weights, or network needed."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('qwen_generator', Path(__file__).resolve().parents[1] / 'scripts/build-qwen3-audio.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class QwenGeneratorTests(unittest.TestCase):
    def test_teaching_readings_do_not_change_word_contexts(self):
        self.assertEqual(generator.reading_text('长。长长的绳子。'), '常。长长的绳子。')
        self.assertEqual(generator.reading_text('哪个词里有“背”？'), '哪个词里有“杯”？')
        for text in ['小苗慢慢长大。', '种子发芽了。', '子弹', '倒水', '仿佛', '率领', '背后']:
            self.assertEqual(generator.reading_text(text).rstrip('。'), text.rstrip('。'))

    def test_pinyin_labels_are_spoken_as_reviewed_chinese_cues(self):
        self.assertEqual(generator.reading_text('声母b，听起来像波。'), '声母波，听起来像波。')
        self.assertEqual(generator.reading_text('韵母üe，听起来像约。'), '韵母约，听起来像约。')
        with self.assertRaises(ValueError):
            generator.reading_text('声母hello，听起来像波。')

    def test_audio_at_token_limit_is_rejected_instead_of_truncated(self):
        wave = [0] * generator.RATE
        with self.assertRaisesRegex(ValueError, 'token limit'):
            generator.checked_duration(wave, '小花。', 160, 160)
        self.assertEqual(generator.checked_duration(wave, '小花。', 13, 160), 1)

    def test_missing_long_sentence_and_runaway_speech_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'duration'):
            generator.checked_duration([0] * 1000, '欢迎来到我们的小岛。', 2, 160)
        with self.assertRaisesRegex(ValueError, 'duration'):
            generator.checked_duration([0] * generator.RATE * 10, '山。', 125, 160)

    def test_compute_limit_preserves_every_duration_valid_natural_stop(self):
        for text in ['山。', '欢迎来到我们的小岛。', '很长的完整讲解。' * 30]:
            limit = generator.generation_token_limit([text])
            longest_valid_frames = int((generator.maximum_duration(text) - .18) * 12.5)
            self.assertGreater(limit, longest_valid_frames)
            generator.checked_duration([0] * round((longest_valid_frames / 12.5 + .18) * generator.RATE), text, longest_valid_frames, limit)
        self.assertLess(generator.generation_token_limit(['山。']), 60)

    def test_voice_and_reading_changes_invalidate_all_cached_files(self):
        current = generator.renderer_configuration()
        original = generator.filename(generator.canonical(current), '长。')
        for field, value in [('style', '不同的语气'), ('voice', 'Serena'), ('readingOverrideSHA256', '0' * 64)]:
            changed = dict(current, **{field: value})
            self.assertNotEqual(generator.filename(generator.canonical(changed), '长。'), original)


if __name__ == '__main__':
    unittest.main()
