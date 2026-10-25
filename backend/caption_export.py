"""ASS karaoke events use absolute source times, never cumulative durations."""
import math

PRESETS = {"box-yellow": "47E4FF", "box-red": "5C4BFF", "outline": "47E4FF",
           "box-violet": "FF9AC4", "box-cyan": "FFDF48", "box-green": "5BFFB7",
           "paper": "702BD9", "neon": "FFDF48", "minimal": "FFFFFF"}


def number(value):
    return type(value) in (float, int) and math.isfinite(value)


def validate_payload(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("settings"), dict):
        raise ValueError("Nieprawidłowe dane napisów.")
    settings = payload.get("settings", {})
    preset, position, size = settings.get("preset"), settings.get("position"), settings.get("size")
    if preset not in PRESETS or position not in {"bottom", "middle", "top", "custom"} or not number(size) or not 2 <= size <= 20:
        raise ValueError("Nieprawidłowe ustawienia napisów.")
    x, y, field_width = settings.get('x', .5), settings.get('y', {'bottom': .78, 'middle': .5, 'top': .22, 'custom': .5}[position]), settings.get('width', .88)
    if not all(number(value) for value in (x, y, field_width)) or not 0 <= x <= 1 or not 0 <= y <= 1 or not .2 <= field_width <= .96:
        raise ValueError('Nieprawidłowe położenie lub szerokość napisów.')
    source = payload.get("cues")
    if not isinstance(source, list) or not 1 <= len(source) <= 100000:
        raise ValueError("Brak prawidłowych fraz ze znacznikami czasu.")
    cues = []
    previous = -1
    for cue in source:
        if not isinstance(cue, dict):
            raise ValueError("Nieprawidłowa fraza.")
        start, end = cue.get("start"), cue.get("end")
        if not number(start) or not number(end) or start < 0 or end <= start or start < previous:
            raise ValueError("Nieprawidłowa kolejność lub czas fraz.")
        previous = start
        words = cue.get("words")
        if not isinstance(words, list) or not 1 <= len(words) <= 30:
            raise ValueError("Nieprawidłowy tekst frazy.")
        clean = []
        for word in words:
            if not isinstance(word, dict):
                raise ValueError("Nieprawidłowe słowo.")
            text, ws, we = word.get("text"), word.get("start"), word.get("end")
            if not isinstance(text, str) or not text.strip() or len(text) > 200:
                raise ValueError("Nieprawidłowy tekst słowa.")
            if ws is not None or we is not None:
                if not number(ws) or not number(we) or ws < start or we > end or we <= ws:
                    raise ValueError("Czas słowa wykracza poza frazę.")
            clean.append({"text": text, "start": ws, "end": we})
        line_break = cue.get("breakAfter", -1)
        if type(line_break) is not int or not -1 <= line_break < len(clean) - 1:
            raise ValueError("Nieprawidłowy podział wierszy.")
        cues.append({"start": start, "end": end, "words": clean, "breakAfter": line_break})
    return {"settings": {"preset": preset, "size": size, "position": position, "animated": bool(settings.get("animated", True)), 'x': x, 'y': y, 'width': field_width}, "cues": cues}


def ass_time(seconds):
    centiseconds = max(0, round(seconds * 100))
    return f"{centiseconds // 360000}:{centiseconds // 6000 % 60:02}:{centiseconds // 100 % 60:02}.{centiseconds % 100:02}"


def escape_text(text):
    return text.replace("\\", "＼").replace("{", "｛").replace("}", "｝").replace("\n", " ").replace("\r", " ")


def font_size(cue, width, height, percent):
    lines = [[], []]
    for index, word in enumerate(cue["words"]):
        lines[1 if cue["breakAfter"] >= 0 and index > cue["breakAfter"] else 0].append(word["text"])
    length = max(len(" ".join(line)) for line in lines)
    return max(10, min(height * percent / 100, width * .88 / (max(length, 1) * .66)))


def caption_layout(cue, width, height, percent, field_width):
    available = width * field_width
    longest = max(len(word['text']) for word in cue['words'])
    size = min(height * percent / 100, available / ((longest + .6) * .66))
    breaks, length = [], 0
    for index, word in enumerate(cue['words']):
        count = len(word['text'])
        if index and length and (length + 1 + count + .6) * size * .66 > available:
            breaks.append(index - 1)
            length = count
        else:
            length += (1 if length else 0) + count
    size = min(size, height * .9 / ((len(breaks) + 1) * 1.3 + .24))
    return size, breaks, size * ((len(breaks) + 1) * 1.3 + .24)


def cue_intervals(cue, end):
    boundaries = {cue["start"], end}
    for word in cue["words"]:
        if word["start"] is not None:
            boundaries.update(value for value in (word["start"], word["end"]) if cue["start"] < value < end)
    times = sorted(boundaries)
    intervals = []
    for start, stop in zip(times, times[1:]):
        midpoint, active = (start + stop) / 2, -1
        for index, word in enumerate(cue["words"]):
            if word["start"] is not None and word["start"] <= midpoint < word["end"]:
                active = index
        if intervals and intervals[-1][2] == active:
            intervals[-1] = (intervals[-1][0], stop, active)
        else:
            intervals.append((start, stop, active))
    return intervals


def build_ass(payload, width, height, duration):
    settings, cues = payload["settings"], payload["cues"]
    preset = settings["preset"]
    outlined = preset in {'outline', 'neon', 'minimal'}
    border = 1 if outlined else 3
    default_size = height * settings["size"] / 100
    outline = default_size * (.055 if outlined else .12)
    alignment = 5
    layouts = [caption_layout(cue, width, height, settings['size'], settings['width']) for cue in cues]
    max_height = max(.04, max(layout[2] / height for layout in layouts))
    x = max(settings['width'] / 2 + .02, min(.98 - settings['width'] / 2, settings['x']))
    y = max(max_height / 2 + .02, min(.98 - max_height / 2, settings['y']))
    text_colour = '1D1316' if preset == 'paper' else 'C9BDBD' if preset == 'minimal' else 'FFFFFF'
    back_colour = '00FFFFFF' if preset == 'paper' else '20000000'
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,{default_size:.2f},&H00{text_colour},&H00{text_colour},&H{back_colour},&H{back_colour},-1,0,0,0,100,100,0,0,{border},{outline:.2f},0,{alignment},0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for index, cue in enumerate(cues):
        end = min(cue["end"], duration, cues[index + 1]["start"] if index + 1 < len(cues) else duration)
        if end <= cue["start"]:
            continue
        size, breaks, _ = layouts[index]
        prefix = f"{{\\an{alignment}\\pos({width * x:.2f},{height * y:.2f})\\fs{size:.2f}\\bord{size * (.055 if outlined else .12):.2f}\\q2}}"
        for start, stop, active in cue_intervals(cue, end):
            if ass_time(start) == ass_time(stop):
                continue
            pieces = []
            for word_index, word in enumerate(cue["words"]):
                colour = PRESETS[preset] if word_index == active else text_colour
                pop = "\\fscx108\\fscy108\\t(0,120,\\fscx100\\fscy100)" if word_index == active and settings["animated"] else "\\fscx100\\fscy100"
                pieces.append(f"{{\\1c&H{colour}&{pop}}}" + escape_text(word["text"]))
                if word_index in breaks:
                    pieces.append("\\N")
                elif word_index < len(cue["words"]) - 1:
                    pieces.append(" ")
            events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(stop)},Default,,0,0,0,,{prefix}{''.join(pieces)}")
    return header + "\n".join(events) + "\n"
