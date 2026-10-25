import unittest
from backend.timing import normalize_segments, restore_word_order


class TimingTests(unittest.TestCase):
    def test_unalignable_sentences_are_kept_as_untimed_words(self):
        source = [{"start": 1, "end": 2, "text": "2014."}, {"start": 3, "end": 4, "text": "Dzień dobry."}]
        aligned = [{"words": [{"word": "Dzień", "start": 3.1, "end": 3.5}, {"word": "dobry.", "start": 3.6, "end": 3.9}]}]
        rows = normalize_segments(restore_word_order(source, aligned), 0, 5, 5)
        self.assertEqual(rows[0]["words"][0]["text"], "2014.")
        self.assertIsNone(rows[0]["words"][0]["start"])
        self.assertEqual(rows[1]["words"][0]["start"], 3.1)

    def test_chunk_offsets_keep_original_word_precision(self):
        rows = normalize_segments([{"start": 2.125, "end": 3.8, "text": "Dwa słowa", "words": [
            {"word": "Dwa", "start": 2.125, "end": 2.815, "score": .92},
            {"word": "słowa", "start": 3.015, "end": 3.8},
        ]}], 298, 900, 602)
        self.assertEqual(rows[0]["start"], 300.125)
        self.assertEqual(rows[0]["words"][1]["start"], 301.015)
        self.assertEqual(rows[0]["words"][1]["end"], 301.8)

    def test_missing_alignment_is_preserved_without_interpolation(self):
        rows = normalize_segments([{"start": 1, "end": 2, "words": [{"word": "2014."}]}], 0, 10, 10)
        self.assertIsNone(rows[0]["words"][0]["start"])
        self.assertEqual(rows[0]["words"][0]["timing"], "unavailable")

    def test_invalid_values_do_not_escape_into_json_or_media_clock(self):
        rows = normalize_segments([{"start": 1, "end": 4, "words": [
            {"word": "źle", "start": float("nan"), "end": 2},
            {"word": "koniec", "start": 3, "end": 7},
        ]}], 8, 12, 12)
        self.assertIsNone(rows[0]["words"][0]["start"])
        self.assertEqual(rows[0]["words"][1]["end"], 12)


if __name__ == '__main__':
    unittest.main()
