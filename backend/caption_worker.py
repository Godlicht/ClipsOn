"""Render animated captions locally; use NVENC when available."""
import json
import os
from pathlib import Path
import subprocess
import sys
import imageio_ffmpeg

from backend.caption_export import build_ass, validate_payload


def choose_encoder(ffmpeg, flags):
    probe = subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
        'color=s=320x180:d=0.1', '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-'], capture_output=True, creationflags=flags)
    if probe.returncode == 0:
        return 'h264_nvenc', ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '20', '-b:v', '0']
    return 'libx264', ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20']


def write_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)


def run(directory):
    def status(stage, **extra):
        write_json(directory / 'status.json', {'state': 'processing', 'stage': stage, **extra})
    status('preparing')
    payload = validate_payload(json.loads((directory / 'captions.json').read_text(encoding='utf-8')))
    source = directory / 'source.media'
    reader = imageio_ffmpeg.read_frames(str(source))
    try:
        metadata = next(reader)
    finally:
        reader.close()
    width, height = metadata['size']
    duration = metadata.get('duration', 0)
    if not duration or width <= 0 or height <= 0:
        raise ValueError('Nie udało się odczytać długości lub wymiarów wideo.')
    if payload['cues'][-1]['end'] > duration + .5:
        raise ValueError('Transkrypcja wykracza poza długość wideo. Wczytaj wynik dla tego samego nagrania.')
    (directory / 'captions.ass').write_text(build_ass(payload, width, height, duration), encoding='utf-8-sig')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    encoder, codec = choose_encoder(ffmpeg, flags)
    command = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', 'source.media',
        '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'ass=captions.ass,pad=ceil(iw/2)*2:ceil(ih/2)*2',
        *codec, '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        '-progress', 'pipe:1', '-nostats', 'captioned.mp4']
    status('encoding', progress=0, encoder=encoder)
    with open(directory / 'ffmpeg.log', 'w', encoding='utf-8') as log:
        process = subprocess.Popen(command, cwd=directory, stdout=subprocess.PIPE, stderr=log, text=True, creationflags=flags)
        for line in process.stdout:
            if line.startswith('out_time_us='):
                try:
                    position = int(line.partition('=')[2]) / 1_000_000
                    status('encoding', progress=min(.99, max(0, position / duration)), encoder=encoder)
                except ValueError:
                    pass
        process.stdout.close()
        code = process.wait()
    if code:
        raise ValueError('Nie udało się zapisać filmu. Szczegóły są w lokalnym pliku ffmpeg.log.')
    write_json(directory / 'result.json', {'filename': 'ClipsON-napisy.mp4', 'duration': duration, 'encoder': encoder,
                                         'width': width, 'height': height, 'preset': payload['settings']['preset']})
    write_json(directory / 'status.json', {'state': 'completed', 'stage': 'finished'})


if __name__ == '__main__':
    directory = Path(sys.argv[1]).resolve()
    try:
        run(directory)
    except Exception as error:
        import traceback
        traceback.print_exc()
        (directory / 'captioned.mp4').unlink(missing_ok=True)
        write_json(directory / 'status.json', {'state': 'failed', 'stage': 'failed', 'error': str(error)[:700]})
        sys.exit(1)
