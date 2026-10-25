import json
from pathlib import Path
import sys
from backend.caption_worker import write_json
from backend.highlights import validate_analysis, build_candidates, parse_ranking, choose_diverse, ranking_items


def run(directory):
    def status(stage, **extra):
        write_json(directory / 'status.json', {'state': 'processing', 'stage': stage, **extra})
    status('candidates')
    options = validate_analysis(json.loads((directory / 'analysis.json').read_text(encoding='utf-8')))
    candidates = build_candidates(options)
    ranked, runtime = candidates, {}
    if options['engine'] == 'semantic' and candidates:
        from backend.runtime import runtime_info
        from backend.highlight_model import LocalEditor
        runtime = runtime_info()
        status('loading-editor', **runtime)
        editor = LocalEditor(runtime['device'])
        ranked = []
        valid_responses = 0
        batches = [candidates[index:index + 8] for index in range(0, len(candidates), 8)]
        for index, batch in enumerate(batches):
            status('analysing', batch=index + 1, batches=len(batches), **runtime)
            # Halve overlong evidence batches rather than truncating source text.
            try:
                response = editor.rank(batch, options['focus'])
                (directory / f'ranking-{index + 1}.txt').write_text(response, encoding='utf-8')
                parsed = parse_ranking(response, batch)
                valid_responses += bool(parsed) or ranking_items(response) == []
                ranked.extend(parsed)
            except ValueError:
                for half in (batch[:len(batch)//2], batch[len(batch)//2:]):
                    response = editor.rank(half, options['focus'])
                    parsed = parse_ranking(response, half)
                    valid_responses += bool(parsed) or ranking_items(response) == []
                    ranked.extend(parsed)
        if not valid_responses:
            raise ValueError('Model nie zwrócił prawidłowych propozycji. Spróbuj ponownie lub wybierz szybką analizę tekstu.')
    clips = choose_diverse(ranked, options['count'])
    warnings = []
    if not candidates:
        warnings.append('Brak odpowiednich wypowiedzi z wiarygodnymi znacznikami czasu.')
    if candidates and not clips and options['engine'] == 'semantic':
        warnings.append('AI nie wskazało samodzielnych fragmentów w tym materiale. Spróbuj zmienić temat analizy lub użyć szybkiej analizy tekstu.')
    if len(clips) < options['count']:
        warnings.append('Znaleziono mniej odrębnych fragmentów niż wybrana liczba. Nie powielamy klipów, aby uzupełnić listę.')
    if clips and any(item['end'] - item['start'] < options['minDuration'] for item in clips):
        warnings.append('Wypowiedzi są krótsze niż wybrana długość. Zachowano je bez dopełniania ciszą.')
    write_json(directory / 'result.json', {'version': 1, 'timebase': 'source-media-seconds',
        'engine': options['engine'], 'model': 'Qwen3-4B-Instruct-2507' if options['engine'] == 'semantic' else None,
        'duration': options['duration'], 'clips': clips, 'warnings': warnings, **runtime})
    write_json(directory / 'status.json', {'state': 'completed', 'stage': 'finished'})


if __name__ == '__main__':
    directory = Path(sys.argv[1]).resolve()
    try:
        run(directory)
    except Exception as error:
        import traceback
        traceback.print_exc()
        write_json(directory / 'status.json', {'state': 'failed', 'stage': 'failed', 'error': str(error)})
        sys.exit(1)
