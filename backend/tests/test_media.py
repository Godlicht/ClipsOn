from pathlib import Path
import subprocess
import tempfile
import unittest
import imageio_ffmpeg
import numpy as np
import soundfile as sf
from backend.media import extract_audio


class MediaClockTests(unittest.TestCase):
    def test_delayed_audio_track_keeps_its_video_clock_offset(self):
        with tempfile.TemporaryDirectory() as temp:
            video = Path(temp) / 'delayed.mp4'
            audio = Path(temp) / 'extracted.wav'
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y',
                '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=3',
                '-itsoffset', '1.25', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
                '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', str(video)], check=True)
            extract_audio(video, audio)
            samples, rate = sf.read(audio)
            onset = np.flatnonzero(np.abs(samples) > 0.02)[0] / rate
            self.assertAlmostEqual(onset, 1.25, delta=0.06)
            self.assertGreater(len(samples) / rate, 2.1)


if __name__ == '__main__':
    unittest.main()
