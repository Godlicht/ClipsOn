from pathlib import Path
import subprocess
import tempfile
import unittest
import imageio_ffmpeg
import numpy as np
import soundfile as sf
from backend.media import extract_audio
from backend.clip_worker import run as render_clips
from unittest.mock import patch
import json


class MediaClockTests(unittest.TestCase):
    def test_exported_clip_keeps_delayed_audio_relative_to_its_cut(self):
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp)
            subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-y',
                '-f','lavfi','-i','color=c=black:s=160x90:r=25:d=4','-itsoffset','1.25',
                '-f','lavfi','-i','sine=frequency=440:duration=2','-map','0:v','-map','1:a',
                '-c:v','libx264','-c:a','aac','-f','mp4',str(directory/'source.media')],check=True)
            (directory/'clips.json').write_text(json.dumps({'clips':[{'id':'test','title':'Test','start':.5,'end':2.5},
                {'id':'second','title':'Drugi','start':1.5,'end':3}]}),encoding='utf-8')
            with patch('backend.clip_worker.choose_encoder',return_value=('libx264',['-c:v','libx264','-preset','ultrafast'])):
                render_clips(directory)
            extract_audio(directory/'clip-01.mp4',directory/'clip.wav')
            samples,rate=sf.read(directory/'clip.wav')
            onset=np.flatnonzero(np.abs(samples)>.02)[0]/rate
            self.assertAlmostEqual(onset,.75,delta=.07)
            self.assertAlmostEqual(len(samples)/rate,2,delta=.08)
            result=json.loads((directory/'result.json').read_text(encoding='utf-8'))
            self.assertEqual(len(result['clips']),2)
            self.assertTrue((directory/'clip-02.mp4').is_file())

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
