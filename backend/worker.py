"""One isolated WhisperX process per job, with bounded audio memory."""
import gc
import json
import math
import os
from pathlib import Path
import sys

from backend.timing import normalize_segments, restore_word_order
from backend.runtime import runtime_info

CHUNK_SECONDS = 300


def write_json(path, data):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(path)


def run(job_dir, language="pl", model_name="large-v3"):
    runtime = {}
    def status(stage, **extra):
        write_json(job_dir / "status.json", {"state": "processing", "stage": stage, **runtime, **extra})

    # HF caches live inside the project. Recordings are never uploaded to HF.
    cache = job_dir.parent.parent / "models"
    os.environ.setdefault("HF_HOME", str(cache / "huggingface"))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("PYANNOTE_METRICS_ENABLED", "0")
    os.environ.setdefault("TORCH_HOME", str(cache / "torch"))
    os.environ.setdefault("NLTK_DATA", str(cache / "nltk"))
    (cache / "nltk").mkdir(parents=True, exist_ok=True)
    from backend.media import extract_audio
    source = job_dir / "source.media"
    audio_path = job_dir / "audio.wav"
    status("extracting")
    # Preserve the media clock: insert silence for delayed audio and resample
    # against timestamps. Never trim silence or concatenate VAD fragments.
    extract_audio(source, audio_path)
    status("loading")
    import numpy as np
    import torch
    runtime = runtime_info()
    device, compute_type = runtime["device"], runtime["computeType"]
    status("loading")
    import whisperx
    model = whisperx.load_model(model_name, device, compute_type=compute_type,
                                language=None if language == "auto" else language,
                                vad_method="silero", download_root=str(cache / "whisper"),
                                asr_options={"beam_size": 5})
    # WAV uses standard RIFF for normal files. ffmpeg's RF64 is supported by
    # soundfile for very long recordings, without loading everything into RAM.
    import soundfile as sf
    all_segments = []
    align_models = {}
    detected_language = None
    with sf.SoundFile(str(audio_path)) as audio_file:
        sample_rate = audio_file.samplerate
        duration = len(audio_file) / sample_rate
        chunks = max(1, math.ceil(duration / CHUNK_SECONDS))
        for index in range(chunks):
            offset = index * CHUNK_SECONDS
            # 2s context on each side; ownership by segment midpoint prevents
            # duplicated segments across chunk boundaries.
            read_start = max(0, offset - 2)
            read_end = min(duration, offset + CHUNK_SECONDS + 2)
            audio_file.seek(round(read_start * sample_rate))
            audio = audio_file.read(round((read_end - read_start) * sample_rate), dtype="float32")
            status("transcribing", chunk=index + 1, chunks=chunks, completedSeconds=offset, duration=duration, device=device)
            result = model.transcribe(np.asarray(audio), batch_size=4 if device == "cuda" else 1,
                                      language=None if language == "auto" else language)
            lang = result.get("language", language)
            detected_language = detected_language or lang
            if not result.get("segments"):
                continue
            status("aligning", chunk=index + 1, chunks=chunks, completedSeconds=offset, duration=duration, device=device)
            if lang not in align_models:
                align_models.clear()
                gc.collect()
                align_models[lang] = whisperx.load_align_model(language_code=lang, device=device, model_dir=str(cache / "alignment"))
            alignment_model, metadata = align_models[lang]
            aligned = whisperx.align(result["segments"], alignment_model, metadata, audio, device,
                                     interpolate_method="ignore", return_char_alignments=False)
            rows = normalize_segments(restore_word_order(result["segments"], aligned["segments"]), read_start, duration, read_end)
            # Split ownership by word midpoint so a sentence crossing the
            # boundary cannot duplicate or lose words just because of grouping.
            lower, upper = offset, min(duration, offset + CHUNK_SECONDS)
            for row in rows:
                kept = []
                for word in row["words"]:
                    midpoint = ((word["start"] + word["end"]) / 2 if word["start"] is not None
                                else (row["start"] + row["end"]) / 2)
                    if lower <= midpoint < upper:
                        kept.append(word)
                if kept:
                    timed = [word for word in kept if word["start"] is not None]
                    all_segments.append({"start": timed[0]["start"] if timed else row["start"],
                                         "end": timed[-1]["end"] if timed else row["end"],
                                         "text": " ".join(word["text"] for word in kept), "words": kept})
                elif not row["words"] and lower <= (row["start"] + row["end"]) / 2 < upper:
                    all_segments.append(row)
            del audio, result, aligned
            gc.collect()
    all_segments.sort(key=lambda segment: segment["start"])
    missing = sum(word["start"] is None for segment in all_segments for word in segment["words"])
    write_json(job_dir / "result.json", {"version": 1, "timebase": "source-media-seconds",
               "engine": "whisperx", "model": model_name, **runtime, "language": detected_language or language,
               "duration": round(duration, 3), "alignment": "forced", "unalignedWords": missing,
               "segments": all_segments})
    status("finished", state="completed")


if __name__ == "__main__":
    directory = Path(sys.argv[1]).resolve()
    try:
        run(directory, sys.argv[2], sys.argv[3])
    except Exception as error:
        import traceback
        traceback.print_exc()
        write_json(directory / "status.json", {"state": "failed", "stage": "failed",
                   "error": str(error)[:700] or "Nie udało się wykonać transkrypcji."})
        sys.exit(1)
