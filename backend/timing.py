"""Keep source-media time in seconds; never distribute words uniformly."""
import math
from difflib import SequenceMatcher


def restore_word_order(source_segments, aligned_segments):
    """Keep every ASR token, including sentences the aligner cannot locate."""
    output = []
    source_words = []
    for segment in source_segments:
        words = [{"word": word} for word in segment.get("text", "").split()]
        source_words.extend(words)
        output.append({**segment, "words": words})
    aligned_words = [word for segment in aligned_segments for word in segment.get("words", [])]
    matcher = SequenceMatcher(None, [word["word"] for word in source_words],
                              [word.get("word", "") for word in aligned_words], autojunk=False)
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            source_words[block.a + offset].update(aligned_words[block.b + offset])
    for segment in output:
        timed = [word for word in segment["words"] if valid_time(word.get("start")) and valid_time(word.get("end")) and word["end"] > word["start"]]
        if timed:
            segment["start"] = min(word["start"] for word in timed)
            segment["end"] = max(word["end"] for word in timed)
    return output


def valid_time(value):
    return isinstance(value, (int, float)) and math.isfinite(value) and value >= 0


def normalize_segments(segments, offset, duration, chunk_end):
    normalized = []
    for segment in segments:
        start = segment.get("start")
        end = segment.get("end")
        if not valid_time(start) or not valid_time(end) or end <= start:
            continue
        start = min(offset + start, chunk_end, duration)
        end = min(offset + end, chunk_end, duration)
        if end <= start:
            continue
        words = []
        for word in segment.get("words", []):
            text = str(word.get("word", "")).strip()
            if not text:
                continue
            ws, we = word.get("start"), word.get("end")
            timed = valid_time(ws) and valid_time(we) and we > ws
            absolute_start = max(start, min(offset + ws, end)) if timed else None
            absolute_end = max(start, min(offset + we, end)) if timed else None
            timed = timed and absolute_end > absolute_start
            score = word.get("score")
            words.append({
                "text": text,
                "start": round(absolute_start, 3) if timed else None,
                "end": round(absolute_end, 3) if timed else None,
                "score": round(score, 3) if isinstance(score, (int, float)) and math.isfinite(score) else None,
                "timing": "aligned" if timed else "unavailable",
            })
        normalized.append({
            "start": round(start, 3), "end": round(end, 3),
            "text": str(segment.get("text", "")).strip(), "words": words,
        })
    return normalized
