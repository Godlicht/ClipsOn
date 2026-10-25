import os
import subprocess
import imageio_ffmpeg


def extract_audio(source, destination):
    """Convert to 16k PCM without rebasing a delayed audio track to zero."""
    command = [imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
               "-i", str(source), "-map", "0:a:0", "-vn", "-af",
               "aresample=16000:async=1:first_pts=0", "-ac", "1", "-ar", "16000",
               "-c:a", "pcm_s16le", "-rf64", "auto", str(destination)]
    process = subprocess.run(command, capture_output=True,
                             creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if process.returncode:
        raise ValueError("Nie udało się odczytać ścieżki audio. Sprawdź, czy nagranie zawiera dźwięk i nie jest uszkodzone.")
