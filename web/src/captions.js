import { buildCaptionCues, captionAt, captionLayout, captionTransform, videoContentRect, clamp, CAPTION_PRESETS } from './caption-utils.js';

export function createCaptionEditor(video, api, onExportBusy = () => {}) {
  const $ = selector => document.querySelector(selector);
  const stage = $('#caption-stage'), overlay = $('#caption-overlay'), line = $('#caption-line');
  const toggle = $('#caption-toggle'), editor = $('#caption-editor'), exportButton = $('#caption-export');
  const settings = { preset: 'box-yellow', size: 6.5, position: 'bottom', words: 4, animated: true, x: .5, y: .78, width: .88 };
  const frame = document.createElement('div'); frame.className = 'caption-transform'; frame.hidden = true;
  frame.tabIndex = 0; frame.setAttribute('role', 'group'); frame.setAttribute('aria-label', 'Położenie napisów. Przeciągnij lub użyj strzałek.');
  frame.setAttribute('aria-describedby', 'caption-edit-help');
  for (const handle of ['w', 'e', 'nw', 'ne', 'sw', 'se']) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.handle = handle;
    button.className = `caption-handle handle-${handle}`;
    button.setAttribute('aria-label', ['w', 'e'].includes(handle) ? 'Zmień szerokość pola napisów' : 'Zmień wielkość napisów');
    frame.append(button);
  }
  overlay.append(frame);
  let editing = false, gesture;
  let file, transcript, cues = [], enabled = true, currentCue = -1, currentWord = -1, starting = false;
  let spans = [], backendReady = false, exporting = false, exportJob, upload, timer, revision = 0;
  let content = { width: 0, height: 0 };

  function controls() {
    toggle.disabled = !cues.length || exporting;
    toggle.setAttribute('aria-checked', String(enabled && !!cues.length));
    exportButton.disabled = !file || !cues.length || !backendReady || exporting;
    $('#caption-download').hidden = exporting || !$('#caption-download').hasAttribute('href');
    document.querySelectorAll('[data-caption-preset], #caption-size, #caption-width, #caption-position, #caption-words, #caption-animation, #caption-reset').forEach(control => { control.disabled = exporting; });
    $('#caption-edit').disabled = !cues.length || exporting;
    frame.hidden = !editing || exporting || !enabled || !cues.length;
    $('#caption-hint').textContent = !transcript ? 'Wykonaj transkrypcję lub wczytaj zapisany JSON dla tego wideo.'
      : !cues.length ? 'Brak słów z ustalonym czasem. Napisy wymagają dopasowanej transkrypcji.'
      : `${cues.length} krótkich fraz · podświetlanie słowo po słowie`;
  }
  function layout() {
    content = videoContentRect(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
    Object.assign(overlay.style, { left: `${content.x}px`, top: `${content.y}px`, width: `${content.width}px`, height: `${content.height}px` });
    if (currentCue >= 0) update(video.currentTime, true);
  }
  function invalidateExport() {
    if (!exporting && $('#caption-download').hasAttribute('href')) {
      $('#caption-download').removeAttribute('href'); $('#caption-download').hidden = true;
      $('#caption-export-status').textContent = 'Wygląd zmieniony. Wyeksportuj nową wersję filmu.';
    }
  }
  function transform() {
    if (!video.videoWidth || !cues.length) return;
    Object.assign(settings, captionTransform(settings, cues, video.videoWidth, video.videoHeight));
    line.style.left = frame.style.left = `${settings.x * 100}%`;
    line.style.top = frame.style.top = `${settings.y * 100}%`;
    frame.style.width = `${settings.width * 100}%`;
    $('#caption-size').value = settings.size; $('#caption-size-value').textContent = `${settings.size.toFixed(1)}%`;
    $('#caption-width').value = settings.width * 100; $('#caption-width-value').textContent = `${Math.round(settings.width * 100)}%`;
    $('#caption-position').value = settings.position;
  }
  function update(time = video.currentTime, force = false) {
    const active = captionAt(cues, time);
    // Keep a real phrase visible in silence while positioning, without moving the video clock.
    if (editing && active.cue < 0 && cues.length) { active.cue = Math.max(0, currentCue); active.word = -1; }
    overlay.hidden = !enabled || active.cue < 0;
    if (active.cue < 0) { currentCue = -1; currentWord = -1; return; }
    if (active.cue !== currentCue || force) {
      currentCue = active.cue; currentWord = -1; spans = [];
      transform();
      const geometry = captionLayout(cues[currentCue], video.videoWidth || 960, video.videoHeight || 540, settings.size, settings.width);
      line.style.fontSize = `${geometry.size * content.height / (video.videoHeight || 540)}px`;
      frame.style.height = `${geometry.height * content.height / (video.videoHeight || 540)}px`;
      const fragment = document.createDocumentFragment();
      cues[currentCue].words.forEach((word, i) => {
        const span = document.createElement('span'); span.className = 'caption-word'; span.textContent = word.text;
        spans.push(span); fragment.append(span);
        if (geometry.breaks.includes(i)) fragment.append(document.createElement('br'));
        else if (i < cues[currentCue].words.length - 1) fragment.append(document.createTextNode(' '));
      });
      line.replaceChildren(fragment);
    }
    if (active.word !== currentWord) {
      spans[currentWord]?.classList.remove('spoken'); currentWord = active.word;
      spans[currentWord]?.classList.add('spoken');
    }
  }
  function configure() {
    invalidateExport();
    settings.size = Number($('#caption-size').value);
    settings.width = Number($('#caption-width').value) / 100;
    settings.position = $('#caption-position').value;
    settings.words = Number($('#caption-words').value);
    settings.animated = $('#caption-animation').checked;
    $('#caption-size-value').textContent = `${settings.size}%`;
    overlay.dataset.preset = settings.preset; overlay.dataset.position = settings.position;
    overlay.classList.toggle('with-animation', settings.animated);
    overlay.style.setProperty('--caption-accent', CAPTION_PRESETS[settings.preset].accent);
    overlay.style.setProperty('--caption-text', CAPTION_PRESETS[settings.preset].text || '#ffffff');
    overlay.style.setProperty('--caption-background', CAPTION_PRESETS[settings.preset].background || (CAPTION_PRESETS[settings.preset].box ? 'rgba(0,0,0,.88)' : 'transparent'));
    cues = buildCaptionCues(transcript, settings.words);
    currentCue = -1; currentWord = -1;
    update(video.currentTime, true); controls();
  }
  toggle.addEventListener('click', () => { enabled = !enabled; controls(); update(); });
  document.querySelectorAll('[data-caption-preset]').forEach(button => button.addEventListener('click', () => {
    settings.preset = button.dataset.captionPreset;
    document.querySelectorAll('[data-caption-preset]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    configure();
  }));
  for (const name of ['#caption-size', '#caption-width', '#caption-words', '#caption-animation']) $(name).addEventListener('input', configure);
  $('#caption-position').addEventListener('input', () => {
    const position = $('#caption-position').value;
    if (position !== 'custom') { settings.x = .5; settings.y = { top: .22, middle: .5, bottom: .78 }[position]; }
    configure();
  });
  function edit(value) {
    editing = value; if (editing) { enabled = true; video.pause(); }
    $('#caption-edit').setAttribute('aria-pressed', String(editing));
    $('#caption-edit').textContent = editing ? '✓ Zakończ edycję' : '↔ Edytuj na ekranie';
    $('#caption-edit-help').hidden = !editing; overlay.classList.toggle('is-editing', editing);
    controls(); update(video.currentTime, true);
  }
  $('#caption-edit').addEventListener('click', () => { edit(!editing); if (editing) frame.focus({ preventScroll: true }); });
  $('#caption-reset').addEventListener('click', () => {
    Object.assign(settings, { x: .5, y: .78, width: .88, size: 6.5, position: 'bottom' });
    transform(); configure();
  });
  function changed() { settings.position = 'custom'; invalidateExport(); update(video.currentTime, true); }
  frame.addEventListener('pointerdown', event => {
    if (!editing || exporting || event.button !== 0) return;
    event.preventDefault(); frame.focus({ preventScroll: true });
    gesture = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, settings: { ...settings },
      width: content.width, height: content.height, handle: event.target.dataset.handle || 'move' };
    frame.setPointerCapture(event.pointerId); frame.classList.add('is-dragging');
  });
  frame.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = (event.clientX - gesture.clientX) / gesture.width, dy = (event.clientY - gesture.clientY) / gesture.height;
    const original = gesture.settings, handle = gesture.handle;
    if (handle === 'move') { settings.x = original.x + dx; settings.y = original.y + dy; }
    else if (handle === 'w' || handle === 'e') {
      // Opposite edge stays put while the field is widened or narrowed.
      const edge = original.x + (handle === 'w' ? 1 : -1) * original.width / 2;
      const desired = clamp(original.width + (handle === 'e' ? dx : -dx), .2, .96);
      settings.width = Math.min(desired, 2 * Math.abs(edge - (handle === 'e' ? .98 : .02)));
      settings.x = edge + (handle === 'e' ? 1 : -1) * settings.width / 2;
    } else {
      const delta = (handle.includes('e') ? dx : -dx) + (handle.includes('s') ? dy : -dy);
      settings.size = clamp(original.size * (1 + delta * 2), 2, 20);
    }
    changed();
  });
  const finishGesture = () => { gesture = undefined; frame.classList.remove('is-dragging'); };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) frame.addEventListener(event, finishGesture);
  frame.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); edit(false); $('#caption-edit').focus(); return; }
    if (!event.key.startsWith('Arrow') || exporting) return;
    event.preventDefault(); const step = event.shiftKey ? .025 : .005;
    if (event.target.dataset.handle) {
      if (['e', 'w'].includes(event.target.dataset.handle)) settings.width += ['ArrowUp', 'ArrowRight'].includes(event.key) ? step : -step;
      else settings.size += ['ArrowUp', 'ArrowRight'].includes(event.key) ? .2 : -.2;
    } else { settings.x += event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
      settings.y += event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0; }
    changed();
  });
  new ResizeObserver(layout).observe(video);
  video.addEventListener('loadedmetadata', () => { layout(); update(video.currentTime, true); });
  for (const event of ['seeking', 'seeked', 'timeupdate']) video.addEventListener(event, () => update());
  $('#caption-fullscreen').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); }
    catch { $('#caption-hint').textContent = 'Pełny ekran jest niedostępny w tej przeglądarce.'; }
  });
  document.addEventListener('fullscreenchange', () => { layout(); update(video.currentTime, true); });
  async function cancelExport() {
    revision++; clearTimeout(timer); upload?.abort(); upload = undefined;
    const id = exportJob; exportJob = undefined; exporting = false; onExportBusy(false);
    if (id) {
      try { await fetch(`${api}/api/caption-exports/${id}`, { method: 'DELETE', headers: { 'X-ClipsON-Client': '1' }, signal: AbortSignal.timeout(10000) }); } catch { /* Connection closed. */ }
    }
    controls();
  }
  function exportError(message) {
    exporting = false; onExportBusy(false); controls();
    $('#caption-export-status').textContent = message;
    $('#caption-export-cancel').hidden = true;
  }
  async function poll(id, version) {
    if (version !== revision) return;
    try {
      const response = await fetch(`${api}/api/caption-exports/${id}`, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (version !== revision) return;
      if (!response.ok) throw new Error(data.detail || 'Nie udało się odczytać eksportu.');
      if (data.state === 'completed') {
        exporting = false; exportJob = undefined; onExportBusy(false);
        const link = $('#caption-download'); link.href = `${api}/api/caption-exports/${id}/download`;
        $('#caption-export-status').textContent = 'Film z animowanymi napisami jest gotowy.';
        $('#caption-export-cancel').hidden = true; controls(); return;
      }
      if (data.state === 'failed') throw new Error(data.error || 'Nie udało się zapisać filmu.');
      if (data.state === 'cancelled') { exportError('Eksport anulowany.'); return; }
      $('#caption-export-status').textContent = data.stage === 'encoding' ? `Zapisywanie filmu… ${Math.round((data.progress || 0) * 100)}%`
        : 'Przygotowywanie napisów do zapisu…';
      timer = setTimeout(() => poll(id, version), 1000);
    } catch (error) { if (version === revision) exportError(error.message); }
  }
  exportButton.addEventListener('click', async () => {
    if (!file || !cues.length || exporting || starting) return;
    starting = true;
    const chosenFile = file;
    await cancelExport();
    if (file !== chosenFile) { starting = false; return; }
    const version = revision;
    exporting = true; starting = false; onExportBusy(true); controls();
    if (editing) edit(false);
    $('#caption-download').removeAttribute('href'); $('#caption-download').hidden = true;
    $('#caption-export-status').textContent = 'Przygotowywanie eksportu…';
    $('#caption-export-cancel').hidden = false;
    const id = crypto.randomUUID().replaceAll('-', ''); exportJob = id;
    try {
      const response = await fetch(`${api}/api/caption-exports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ClipsON-Client': '1' },
        body: JSON.stringify({ id, settings, cues }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (version !== revision) return;
      if (!response.ok) throw new Error(data.detail || 'Nie udało się rozpocząć eksportu.');
      const xhr = new XMLHttpRequest(); upload = xhr;
      xhr.open('POST', `${api}/api/caption-exports/${id}/video`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-ClipsON-Client', '1');
      xhr.upload.onprogress = event => {
        if (version === revision && event.lengthComputable) $('#caption-export-status').textContent = `Przekazywanie do lokalnego silnika… ${Math.round(event.loaded / event.total * 100)}%`;
      };
      xhr.onload = () => {
        if (version !== revision) return;
        upload = undefined;
        if (xhr.status === 202) poll(id, version);
        else { let message = 'Nie udało się przekazać wideo.'; try { message = JSON.parse(xhr.responseText).detail || message; } catch {} exportError(message); }
      };
      xhr.onerror = () => { if (version === revision) exportError('Utracono połączenie z lokalnym silnikiem.'); };
      xhr.send(file);
    } catch (error) { if (version === revision) exportError(error.message); }
  });
  $('#caption-export-cancel').addEventListener('click', async () => { await cancelExport(); exportError('Eksport anulowany.'); });
  configure();
  return {
    update,
    setBackendReady(value) { backendReady = value; controls(); },
    setFile(value) {
      void cancelExport(); file = value; transcript = undefined; cues = []; currentCue = -1; currentWord = -1;
      overlay.hidden = true; editor.hidden = !file; $('#caption-download').removeAttribute('href');
      edit(false);
      $('#caption-export-status').textContent = ''; $('#caption-export-cancel').hidden = true; controls();
    },
    setTranscript(value) { transcript = value; configure(); if (cues.length) $('#caption-options').open = true; },
  };
}
