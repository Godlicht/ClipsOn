import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile
import imageio_ffmpeg
from backend.caption_worker import write_json, choose_encoder
from backend.caption_export import build_ass
from backend.clip_export import validate_export, cut_captions


def cleanup_outputs(directory):
    for path in [*directory.glob('clip-*.mp4'), directory / 'ClipsON-klipy.zip']:
        path.unlink(missing_ok=True)


def run(directory):
    def status(stage, **extra):
        write_json(directory / 'status.json', {'state': 'processing', 'stage': stage, **extra})
    status('preparing-clips')
    payload = validate_export(json.loads((directory / 'clips.json').read_text(encoding='utf-8')))
    reader = imageio_ffmpeg.read_frames(str(directory / 'source.media'))
    try:
        metadata = next(reader)
    finally:
        reader.close()
    duration = metadata.get('duration', 0)
    if not duration or any(clip['end'] > duration + .05 for clip in payload['clips']):
        raise ValueError('Klip wykracza poza długość wideo. Sprawdź transkrypcję i granice cięcia.')
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    encoder, codec = choose_encoder(ffmpeg, flags)
    total = sum(clip['end'] - clip['start'] for clip in payload['clips'])
    completed, results = 0, []
    for index, clip in enumerate(payload['clips']):
        start, end = clip['start'], min(duration, clip['end'])
        length = end - start
        filename = f'clip-{index + 1:02}.mp4'
        width, height = (720, 1280) if payload['format'] == 'vertical' else tuple(value // 2 * 2 for value in metadata['size'])
        subtitle_filter = ''
        if payload['captions']:
            captions = cut_captions(payload['captions'], start, end)
            if captions['cues']:
                ass_name = f'clip-{index + 1:02}.ass'
                (directory / ass_name).write_text(build_ass(captions, width, height, length), encoding='utf-8-sig')
                subtitle_filter = f',ass={ass_name}'
        if payload['format'] == 'vertical':
            filters = ['-filter_complex', '[0:v:0]split=2[back][front];'
                '[back]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:2[bg];'
                '[front]scale=720:1280:force_original_aspect_ratio=decrease[fg];'
                f'[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1{subtitle_filter}[out]', '-map', '[out]']
        else:
            filters = ['-vf', f'scale={width}:{height},setsar=1{subtitle_filter}', '-map', '0:v:0']
        command = [ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{start:.6f}',
            '-i', 'source.media', '-t', f'{length:.6f}', *filters, '-map', '0:a:0?', *codec,
            '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-progress', 'pipe:1', '-nostats', filename]
        status('encoding-clips', clip=index + 1, clips=len(payload['clips']), progress=completed / total, encoder=encoder)
        with open(directory / f'clip-{index + 1:02}.log', 'w', encoding='utf-8') as log:
            process = subprocess.Popen(command, cwd=directory, stdout=subprocess.PIPE, stderr=log, text=True, creationflags=flags)
            for line in process.stdout:
                if line.startswith('out_time_us='):
                    try:
                        position = min(length, max(0, int(line.partition('=')[2]) / 1_000_000))
                        status('encoding-clips', clip=index + 1, clips=len(payload['clips']),
                               progress=min(.99, (completed + position) / total), encoder=encoder)
                    except ValueError:
                        pass
            process.stdout.close()
            code = process.wait()
        if code:
            raise ValueError(f'Nie udało się zapisać klipu {index + 1}. Szczegóły są w lokalnym pliku clip-{index + 1:02}.log.')
        completed += length
        results.append({**clip, 'index': index, 'filename': filename, 'duration': length, 'width': width, 'height': height})
    status('packing-clips', progress=.99)
    result = {'clips': results, 'encoder': encoder, 'format': payload['format'], 'archive': 'ClipsON-klipy.zip'}
    with zipfile.ZipFile(directory / 'ClipsON-klipy.zip', 'w', compression=zipfile.ZIP_STORED) as archive:
        for clip in results:
            archive.write(directory / clip['filename'], clip['filename'])
        archive.writestr('klipy.json', json.dumps(result, ensure_ascii=False, indent=2))
    write_json(directory / 'result.json', result)
    write_json(directory / 'status.json', {'state': 'completed', 'stage': 'finished'})


if __name__ == '__main__':
    directory = Path(sys.argv[1]).resolve()
    try:
        run(directory)
    except Exception as error:
        import traceback
        traceback.print_exc()
        cleanup_outputs(directory)
        write_json(directory / 'status.json', {'state': 'failed', 'stage': 'failed', 'error': str(error)})
        sys.exit(1)
