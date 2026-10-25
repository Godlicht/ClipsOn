"""Validate cuts and translate source caption times to each clip's clock."""
import re
from backend.caption_export import number, validate_payload


def validate_export(data):
    if not isinstance(data, dict) or data.get('format', 'original') not in {'original', 'vertical'}:
        raise ValueError('Nieprawidłowy format klipów.')
    clips = data.get('clips')
    if not isinstance(clips, list) or not 1 <= len(clips) <= 8:
        raise ValueError('Wybierz od 1 do 8 klipów.')
    clean, seen = [], set()
    for clip in clips:
        if not isinstance(clip, dict):
            raise ValueError('Nieprawidłowy klip.')
        start, end, identifier = clip.get('start'), clip.get('end'), clip.get('id')
        if not number(start) or not number(end) or start < 0 or not .5 <= end - start <= 180:
            raise ValueError('Każdy klip musi trwać od 0,5 do 180 sekund.')
        if not isinstance(identifier, str) or not re.fullmatch(r'[a-z0-9-]{1,64}', identifier) or identifier in seen:
            raise ValueError('Nieprawidłowy identyfikator klipu.')
        title = clip.get('title', 'Klip')
        if not isinstance(title, str) or len(title) > 160:
            raise ValueError('Nieprawidłowy tytuł klipu.')
        seen.add(identifier)
        clean.append({'id': identifier, 'start': start, 'end': end, 'title': title})
    captions = validate_payload(data['captions']) if data.get('captions') is not None else None
    return {'clips': clean, 'format': data.get('format', 'original'), 'captions': captions}


def cut_captions(payload, start, end):
    cues = []
    for cue in payload['cues']:
        if cue['start'] >= end or cue['end'] <= start:
            continue
        words = []
        for word in cue['words']:
            if word['start'] is None:
                words.append(dict(word))
            elif word['end'] > start and word['start'] < end:
                words.append({**word, 'start': max(start, word['start']) - start,
                              'end': min(end, word['end']) - start})
        if any(word['start'] is not None for word in words):
            cues.append({'start': max(start, cue['start']) - start, 'end': min(end, cue['end']) - start,
                         'words': words, 'breakAfter': -1})
    return {'settings': payload['settings'], 'cues': cues}
