"""Candidate boundaries always come from the source transcript, never the LLM."""
import json
import math
import re


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_analysis(data):
    if not isinstance(data, dict) or not isinstance(data.get('transcript'), dict):
        raise ValueError('Brak transkrypcji do analizy.')
    transcript = data['transcript']
    duration = transcript.get('duration')
    if not number(duration) or duration <= 0:
        raise ValueError('Nieprawidłowa długość nagrania.')
    segments = transcript.get('segments')
    if not isinstance(segments, list) or len(segments) > 100000:
        raise ValueError('Nieprawidłowe segmenty transkrypcji.')
    words, previous = [], -1
    for segment in segments:
        if not isinstance(segment, dict) or not isinstance(segment.get('words', []), list):
            raise ValueError('Nieprawidłowy segment transkrypcji.')
        for word in segment.get('words', []):
            if not isinstance(word, dict) or not isinstance(word.get('text'), str) or len(word['text']) > 200:
                raise ValueError('Nieprawidłowy tekst transkrypcji.')
            start, end = word.get('start'), word.get('end')
            if start is not None or end is not None:
                if not number(start) or not number(end) or start < 0 or end <= start or end > duration + .5 or start < previous:
                    raise ValueError('Nieprawidłowy zegar słów w transkrypcji.')
                previous = start
            if word['text'].strip():
                words.append({'text': word['text'].strip(), 'start': start, 'end': end})
    minimum, maximum, count = data.get('minDuration', 20), data.get('maxDuration', 60), data.get('count', 5)
    if not number(minimum) or not number(maximum) or not 5 <= minimum <= maximum <= 120 or type(count) is not int or not 1 <= count <= 8:
        raise ValueError('Wybierz prawidłową długość i liczbę klipów.')
    engine, focus = data.get('engine', 'semantic'), data.get('focus', '')
    if engine not in {'semantic', 'fast'} or not isinstance(focus, str) or len(focus) > 200:
        raise ValueError('Nieprawidłowe opcje analizy.')
    return {'duration': duration, 'words': words, 'minDuration': minimum, 'maxDuration': maximum,
            'count': count, 'engine': engine, 'focus': focus.strip()}


def units_from_words(words):
    units, buffer = [], []
    def flush():
        timed = [word for word in buffer if word['start'] is not None]
        if timed:
            units.append({'start': timed[0]['start'], 'end': max(word['end'] for word in timed),
                          'text': ' '.join(word['text'] for word in buffer)})
        buffer.clear()
    for word in words:
        timed = [value for value in buffer if value['start'] is not None]
        if timed and word['start'] is not None and (word['start'] - timed[-1]['end'] > 1.5
                or word['end'] - timed[0]['start'] > 14 or len(buffer) >= 32):
            flush()
        buffer.append(word)
        if word['end'] is not None and re.search(r'[.!?…][”"»)]?$', word['text']):
            flush()
    flush()
    return units


def tokens(text):
    return set(re.findall(r'[^\W\d_]{4,}', text.lower()))


def editorial_score(text, focus=''):
    lower = text.lower()
    signals = [
        (r'\?|\b(jak|dlaczego|how|why|what if)\b', 10, 'Pytanie, które może zaciekawić widza.'),
        (r'\b(sekret|błąd|błędy|najważniejsz\w*|zaskocz\w*|nagle|secret|mistake|surpris\w*)\b', 16, 'Wyraźny punkt zwrotny lub nieoczywista obserwacja.'),
        (r'\b(wystarczy|spróbuj|zamiast|warto|sposób|kroki|kroków|tip|instead|steps|try)\b', 13, 'Konkretna wskazówka do wykorzystania.'),
        (r'\b(kiedyś|pamiętam|okazało|zrozumiał\w*|wtedy|pierwszy raz|realized|remember|once)\b', 12, 'Osobista historia z czytelnym przebiegiem.'),
        (r'\b(ale|jednak|dlatego|ponieważ|but|however|because|therefore)\b', 6, 'Wypowiedź zawiera wyjaśnienie lub kontrast.'),
    ]
    score, reasons = 35, []
    for pattern, weight, reason in signals:
        if re.search(pattern, lower):
            score += weight; reasons.append(reason)
    if re.search(r'\d', text):
        score += 4
    if re.search(r'\b(subskryb\w*|sponsor\w*|link w opisie|witajcie|dzień dobry|welcome|subscribe)\b', lower):
        score -= 28
    if re.match(r'^(i |więc |no |tak |and |so |it |to właśnie )', lower):
        score -= 7
    if re.search(r'[.!?…][”"»)]?$', text):
        score += 5
    score += min(15, len(tokens(focus) & tokens(text)) * 6)
    return max(0, min(100, score)), reasons[0] if reasons else 'Zwarty fragment wypowiedzi do samodzielnej oceny.'


def build_candidates(options):
    units = units_from_words(options['words'])
    candidates, seen = [], set()
    for i, unit in enumerate(units):
        parts = []
        for ending_index in range(i, len(units)):
            ending = units[ending_index]
            if parts and ending['start'] - last_end > 3:
                break
            start = max(0, unit['start'] - .12)
            end = min(options['duration'], ending['end'] + .2)
            if end - start > options['maxDuration']:
                break
            parts.append(ending['text']); last_end = ending['end']
            if end - start < options['minDuration']:
                continue
            key = (round(start, 3), round(end, 3))
            if key in seen:
                continue
            text = ' '.join(parts)
            score, reason = editorial_score(text, options['focus'])
            seen.add(key)
            candidates.append({'start': start, 'end': end, 'text': text, 'score': score,
                'title': ' '.join(text.split()[:9]).rstrip(' ,;:') + ('…' if len(text.split()) > 9 else ''), 'reason': reason})
            # Keep a compact and a longer candidate at each opening.
            if sum(1 for value in candidates[-4:] if value['start'] == start) >= 2:
                break
    if not candidates and units:
        # Short speech islands are useful; never pad them with long silence.
        islands = []
        for unit in units:
            if islands and unit['start'] - islands[-1]['end'] <= 3 and unit['end'] - islands[-1]['start'] <= options['maxDuration'] - .32:
                islands[-1]['end'] = unit['end']; islands[-1]['text'] += ' ' + unit['text']
            else:
                islands.append(dict(unit))
        for unit in islands:
            start, end = max(0, unit['start'] - .12), min(options['duration'], unit['end'] + .2)
            if .5 <= end - start <= options['maxDuration']:
                score, reason = editorial_score(unit['text'], options['focus'])
                candidates.append({**unit, 'start': start, 'end': end, 'score': score, 'reason': reason,
                                   'title': ' '.join(unit['text'].split()[:9])})
    # Cover the entire source in the bounded LLM shortlist, not only its beginning.
    buckets = {}
    for candidate in candidates:
        buckets.setdefault(int(candidate['start'] // 45), []).append(candidate)
    shortlist = []
    for group in buckets.values():
        shortlist.extend(choose_diverse(group, 6))
    shortlist = sorted(shortlist, key=lambda item: item['score'], reverse=True)[:96]
    return [{**item, 'id': f'moment-{index + 1}'} for index, item in enumerate(sorted(shortlist, key=lambda item: item['start']))]


def ranking_items(text):
    begin, end = text.find('{'), text.rfind('}')
    try:
        items = json.loads(text[begin:end + 1]).get('moments')
    except (ValueError, AttributeError):
        return None
    return items if isinstance(items, list) else None


def parse_ranking(text, candidates):
    items = ranking_items(text) or []
    allowed, result, seen = {item['id']: item for item in candidates}, [], set()
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or item['id'] not in allowed or item['id'] in seen:
            continue
        score = item.get('score')
        if not number(score) or not isinstance(item.get('title'), str) or not isinstance(item.get('reason'), str):
            continue
        seen.add(item['id'])
        result.append({**allowed[item['id']], 'score': max(0, min(100, score)),
            'title': item['title'].strip()[:120] or allowed[item['id']]['title'], 'reason': item['reason'].strip()[:300]})
    return result


def choose_diverse(candidates, count):
    remaining, chosen = list(candidates), []
    while remaining and len(chosen) < count:
        def adjusted(item):
            similarity = max((len(tokens(item['text']) & tokens(other['text'])) / max(1, len(tokens(item['text']) | tokens(other['text']))) for other in chosen), default=0)
            return item['score'] - similarity * 18
        candidate = max(remaining, key=adjusted)
        remaining.remove(candidate)
        overlap = max((max(0, min(candidate['end'], other['end']) - max(candidate['start'], other['start'])) /
                       min(candidate['end'] - candidate['start'], other['end'] - other['start']) for other in chosen), default=0)
        if overlap <= .2:
            chosen.append(candidate)
    return chosen
