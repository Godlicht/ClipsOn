import { buildCaptionCues, captionAt, captionFontSize, videoContentRect, CAPTION_PRESETS } from './caption-utils.js';

export function createCaptionEditor(video, api, onExportBusy = () => {}) {
  const $ = selector => document.querySelector(selector);
  const stage = $('#caption-stage'), overlay = $('#caption-overlay'), line = $('#caption-line');
  const toggle = $('#caption-toggle'), editor = $('#caption-editor'), exportButton = $('#caption-export');
  const settings = { preset: 'box-yellow', size: 6.5, position: 'bottom', words: 4, animated: true };
  let file, transcript, cues = [], enabled = true, currentCue = -1, currentWord = -1, starting = false;
  let spans = [], backendReady = false, exporting = false, exportJob, upload, timer, revision = 0;
  let content = { width: 0, height: 0 };

  function controls() {
    toggle.disabled = !cues.length || exporting;
    toggle.setAttribute('aria-checked', String(enabled && !!cues.length));
    exportButton.disabled = !file || !cues.length || !backendReady || exporting;
    $('#caption-download').hidden = exporting || !$('#caption-download').hasAttribute('href');
    document.querySelectorAll('[data-caption-preset], #caption-size, #caption-position, #caption-words, #caption-animation').forEach(control => { control.disabled = exporting; });
    $('#caption-hint').textContent = !transcript ? 'Wykonaj transkrypcję lub wczytaj zapisany JSON dla tego wideo.'
      : !cues.length ? 'Brak słów z ustalonym czasem. Napisy wymagają dopasowanej transkrypcji.'
      : `${cues.length} krótkich fraz · podświetlanie słowo po słowie`;
  }
  function layout() {
    content = videoContentRect(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
    Object.assign(overlay.style, { left: `${content.x}px`, top: `${content.y}px`, width: `${content.width}px`, height: `${content.height}px` });
    if (currentCue >= 0) setFont();
  }
  function setFont() {
    if (!video.videoHeight || currentCue < 0) return;
    line.style.fontSize = `${captionFontSize(cues[currentCue], video.videoWidth, video.videoHeight, settings.size) * content.height / video.videoHeight}px`;
  }
  function update(time = video.currentTime, force = false) {
    const active = captionAt(cues, time);
    overlay.hidden = !enabled || active.cue < 0;
    if (active.cue < 0) { currentCue = -1; currentWord = -1; return; }
    if (active.cue !== currentCue || force) {
      currentCue = active.cue; currentWord = -1; spans = [];
      const fragment = document.createDocumentFragment();
      cues[currentCue].words.forEach((word, i) => {
        const span = document.createElement('span'); span.className = 'caption-word'; span.textContent = word.text;
        spans.push(span); fragment.append(span);
        if (i === cues[currentCue].breakAfter) fragment.append(document.createElement('br'));
        else if (i < cues[currentCue].words.length - 1) fragment.append(document.createTextNode(' '));
      });
      line.replaceChildren(fragment); setFont();
    }
    if (active.word !== currentWord) {
      spans[currentWord]?.classList.remove('spoken'); currentWord = active.word;
      spans[currentWord]?.classList.add('spoken');
    }
  }
  function configure() {
    if (!exporting && $('#caption-download').hasAttribute('href')) {
      $('#caption-download').removeAttribute('href');
      $('#caption-export-status').textContent = 'Wygląd zmieniony. Wyeksportuj nową wersję filmu.';
    }
    settings.size = Number($('#caption-size').value);
    settings.position = $('#caption-position').value;
    settings.words = Number($('#caption-words').value);
    settings.animated = $('#caption-animation').checked;
    $('#caption-size-value').textContent = `${settings.size}%`;
    overlay.dataset.preset = settings.preset; overlay.dataset.position = settings.position;
    overlay.classList.toggle('with-animation', settings.animated);
    overlay.style.setProperty('--caption-accent', CAPTION_PRESETS[settings.preset].accent);
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
  for (const name of ['#caption-size', '#caption-position', '#caption-words', '#caption-animation']) $(name).addEventListener('input', configure);
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
      $('#caption-export-status').textContent = ''; $('#caption-export-cancel').hidden = true; controls();
    },
    setTranscript(value) { transcript = value; configure(); if (cues.length) $('#caption-options').open = true; },
  };
}
