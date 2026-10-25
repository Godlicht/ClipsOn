import { timeLabel } from './transcript-utils.js';
import { validClipRange, clipDurationLabel } from './clip-utils.js';

export function createClipEditor(video, api, captions, onBusy = () => {}) {
  const $ = selector => document.querySelector(selector);
  const panel = $('#clips-panel'), results = $('#clips-results');
  const banner = document.createElement('div'); banner.className = 'clip-preview-banner'; banner.hidden = true;
  const previewText = document.createElement('span'), stop = document.createElement('button');
  stop.type = 'button'; stop.textContent = 'Całe wideo'; banner.append(previewText, stop); $('#caption-stage').append(banner);
  let file, transcript, proposals = [], ready = false, aiReady = false, busy = false, externalBusy = false;
  let revision = 0, currentJob, endpoint, request, upload, timer, preview, previewFrame, launching = false;
  const downloads = new Map();

  function controls() {
    panel.hidden = !file;
    const locked = busy || externalBusy;
    panel.querySelectorAll('input, select, button').forEach(element => { element.disabled = locked; });
    $('#clips-cancel').disabled = false;
    $('#clips-cancel').hidden = !busy;
    $('#clips-generate').disabled = locked || !ready || !transcript || ($('#clips-engine').value === 'semantic' && !aiReady);
    $('#clips-export').disabled = locked || !ready || !proposals.some(item => item.selected)
      || proposals.some(item => item.selected && !validClipRange(item.start, item.end, video.duration));
    $('#clips-export-bar').hidden = !proposals.length;
    $('#clips-results-heading').hidden = !proposals.length;
    $('#clips-model-note').hidden = !ready || aiReady || $('#clips-engine').value !== 'semantic';
    $('#clips-hint').textContent = !transcript ? 'Najpierw wykonaj transkrypcję lub wczytaj zapisany JSON.'
      : !ready ? 'Połącz się z lokalnym silnikiem, aby tworzyć klipy.'
      : $('#clips-engine').value === 'fast' ? 'Analiza reguł tekstowych · bez modelu AI'
      : 'Lokalne AI · wybór na podstawie znaczenia wypowiedzi';
  }
  function setBusy(value) { busy = value; onBusy(value); controls(); }
  function status(message, progress) {
    $('#clips-progress-wrap').hidden = false; $('#clips-status').textContent = message;
    if (Number.isFinite(progress)) { $('#clips-progress').max = 1; $('#clips-progress').value = progress; }
    else $('#clips-progress').removeAttribute('value');
  }
  function fail(message) {
    setBusy(false); $('#clips-error').textContent = message; $('#clips-error').hidden = false;
    $('#clips-progress-wrap').hidden = true;
  }
  function clearDownloads() {
    downloads.clear(); $('#clips-download').removeAttribute('href'); $('#clips-download').hidden = true;
    results.querySelectorAll('.clip-download').forEach(link => { link.hidden = true; link.removeAttribute('href'); });
  }
  async function cancel() {
    revision++; clearTimeout(timer); request?.abort(); request = undefined; upload?.abort(); upload = undefined;
    const id = currentJob, path = endpoint; currentJob = undefined;
    setBusy(false);
    if (id) { try { await fetch(`${api}/api/${path}/${id}`, { method: 'DELETE', headers: { 'X-ClipsON-Client': '1' }, signal: AbortSignal.timeout(10000) }); } catch {} }
  }
  function stopPreview(pause = false) {
    preview = undefined; cancelAnimationFrame(previewFrame); banner.hidden = true;
    if (pause) video.pause();
  }
  function watchPreview() {
    if (!preview) return;
    if (video.currentTime >= preview.end) { video.pause(); video.currentTime = preview.end; stopPreview(); return; }
    previewFrame = requestAnimationFrame(watchPreview);
  }
  function previewClip(item) {
    if (!validClipRange(item.start, item.end, video.duration)) { fail('Najpierw popraw granice tego klipu.'); return; }
    stopPreview(); captions.stopEditing(); video.pause(); preview = item;
    video.currentTime = item.start; previewText.textContent = `Podgląd fragmentu · ${timeLabel(item.start)}–${timeLabel(item.end)}`;
    banner.hidden = false; $('#caption-stage').scrollIntoView({ block: 'start', behavior: 'smooth' });
    video.play().then(() => { if (preview) watchPreview(); }).catch(() => { previewText.textContent += ' · naciśnij odtwarzanie'; });
  }
  stop.addEventListener('click', () => stopPreview(true));
  video.addEventListener('play', () => { if (preview) { cancelAnimationFrame(previewFrame); watchPreview(); } });
  video.addEventListener('pause', () => cancelAnimationFrame(previewFrame));
  video.addEventListener('timeupdate', () => { if (preview && video.currentTime >= preview.end) { const end = preview.end; video.pause(); video.currentTime = end; stopPreview(); } });
  video.addEventListener('seeking', () => { if (preview && (video.currentTime < preview.start - .05 || video.currentTime > preview.end + .05)) stopPreview(); });

  function render() {
    const fragment = document.createDocumentFragment();
    proposals.forEach((item, index) => {
      const card = document.createElement('article'); card.className = 'moment-card'; card.dataset.clipId = item.id;
      const heading = document.createElement('div'); heading.className = 'moment-card-heading';
      const selection = document.createElement('label'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = item.selected; checkbox.setAttribute('aria-label', `Wybierz klip ${index + 1}`);
      selection.append(checkbox, document.createTextNode(`MOMENT ${String(index + 1).padStart(2, '0')}`));
      const duration = document.createElement('span'); duration.className = 'clip-duration-label'; duration.textContent = clipDurationLabel(item.end - item.start);
      heading.append(selection, duration);
      const title = document.createElement('h4'); title.textContent = item.title;
      const reason = document.createElement('p'); reason.className = 'clip-reason'; reason.textContent = item.reason;
      const excerpt = document.createElement('blockquote'); excerpt.textContent = item.text;
      const actions = document.createElement('div'); actions.className = 'moment-card-actions';
      const play = document.createElement('button'); play.type = 'button'; play.className = 'button-text'; play.textContent = '▶ Podgląd fragmentu';
      play.addEventListener('click', () => previewClip(item));
      const download = document.createElement('a'); download.className = 'button-text clip-download'; download.textContent = 'Pobierz MP4 ↓'; download.download = `ClipsON-${index + 1}.mp4`; download.hidden = !downloads.has(item.id);
      if (downloads.has(item.id)) download.href = downloads.get(item.id);
      actions.append(play, download);
      const details = document.createElement('details'); details.className = 'clip-trim';
      const summary = document.createElement('summary'); summary.textContent = `${timeLabel(item.start, true)} — ${timeLabel(item.end, true)} · Popraw cięcie`;
      const range = document.createElement('div'); range.className = 'clip-trim-fields';
      const error = document.createElement('p'); error.className = 'clip-range-error'; error.hidden = true;
      for (const [key, label] of [['start', 'Początek (s)'], ['end', 'Koniec (s)']]) {
        const field = document.createElement('label'); field.textContent = label;
        const input = document.createElement('input'); input.type = 'number'; input.step = '.01'; input.min = '0'; input.max = String(video.duration); input.value = item[key].toFixed(2);
        input.setAttribute('aria-label', `${label} klipu ${index + 1}`);
        const fromPlayer = document.createElement('button'); fromPlayer.type = 'button'; fromPlayer.className = 'button-text'; fromPlayer.textContent = 'Z odtwarzacza';
        const changed = () => {
          item[key] = input.value === '' ? NaN : Number(input.value);
          const valid = validClipRange(item.start, item.end, video.duration);
          input.setAttribute('aria-invalid', String(!valid)); error.hidden = valid;
          error.textContent = 'Sprawdź granice: klip musi trwać 0,5–180 s i mieścić się w nagraniu.';
          duration.textContent = valid ? clipDurationLabel(item.end - item.start) : 'Sprawdź cięcie';
          summary.textContent = valid ? `${timeLabel(item.start, true)} — ${timeLabel(item.end, true)} · Popraw cięcie` : 'Popraw granice cięcia';
          clearDownloads(); if (preview?.id === item.id) stopPreview(true); controls();
        };
        input.addEventListener('input', changed);
        fromPlayer.addEventListener('click', () => { input.value = video.currentTime.toFixed(2); changed(); });
        field.append(input, fromPlayer); range.append(field);
      }
      checkbox.addEventListener('change', () => { item.selected = checkbox.checked; controls(); });
      details.append(summary, range, error); card.append(heading, title, reason, excerpt, actions, details); fragment.append(card);
    });
    results.replaceChildren(fragment); controls();
  }
  async function poll(id, version, path) {
    if (version !== revision) return;
    try {
      const response = await fetch(`${api}/api/${path}/${id}`, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (version !== revision) return;
      if (!response.ok) throw new Error(data.detail || 'Nie udało się odczytać zadania.');
      if (data.state === 'failed') throw new Error(data.error || 'Nie udało się ukończyć zadania.');
      if (data.state === 'cancelled') { currentJob = undefined; setBusy(false); status('Zadanie anulowane.', 0); return; }
      if (data.state === 'completed') {
        currentJob = undefined; setBusy(false);
        if (path === 'highlights') {
          proposals = data.result.clips.map(item => ({ ...item, selected: true })); clearDownloads(); render();
          $('#clips-results-title').textContent = `Twoje propozycje · ${proposals.length}`;
          const warning = [...(data.result.warnings || []), ...(!proposals.length && !data.result.warnings?.length ? ['Nie znaleziono fragmentów z dopasowaną mową.'] : [])];
          $('#clips-warning').textContent = warning.join(' '); $('#clips-warning').hidden = !warning.length;
          status(data.result.engine === 'semantic' ? `Analiza AI ukończona · propozycje: ${proposals.length}${data.result.device === 'cuda' ? ' · GPU' : ''}. Obejrzyj je i zaznacz klipy do utworzenia.`
            : `Analiza tekstu ukończona · propozycje: ${proposals.length}. Obejrzyj je przed eksportem.`, 1);
        } else {
          data.result.clips.forEach(item => downloads.set(item.id, `${api}/api/clip-exports/${id}/clips/${item.index}`));
          const link = $('#clips-download'); link.href = `${api}/api/clip-exports/${id}/download`; link.hidden = false;
          render(); status(`Gotowe pliki MP4: ${data.result.clips.length}${data.result.encoder === 'h264_nvenc' ? ' · NVIDIA NVENC' : ''}. Możesz pobrać je osobno lub razem.`, 1);
        }
        return;
      }
      const messages = { candidates: 'Szukanie granic wypowiedzi…', 'loading-editor': 'Ładowanie lokalnego modelu AI…',
        analysing: `Analiza treści · partia ${data.batch || 1} z ${data.batches || 1}${data.device === 'cuda' ? ' · GPU' : ' · CPU'}`,
        'preparing-clips': 'Przygotowywanie cięć i napisów…', 'encoding-clips': `Tworzenie klipu ${data.clip || 1} z ${data.clips || 1} · ${Math.round((data.progress || 0) * 100)}%`,
        'packing-clips': 'Pakowanie gotowych klipów…' };
      status(messages[data.stage] || 'Uruchamianie lokalnego silnika…', data.progress);
      timer = setTimeout(() => poll(id, version, path), 1000);
    } catch (error) { if (version === revision) fail(error.message); }
  }
  async function post(path, data, version) {
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${api}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ClipsON-Client': '1' }, body: JSON.stringify(data), signal: controller.signal });
      const result = await response.json();
      if (version !== revision) return;
      if (!response.ok) throw new Error(result.detail || 'Nie udało się rozpocząć zadania.');
      return result;
    } finally { clearTimeout(timeout); }
  }
  async function begin(path) {
    if (launching) return;
    launching = true;
    const chosenFile = file; await cancel(); launching = false; if (file !== chosenFile) return;
    $('#clips-error').hidden = true; $('#clips-warning').hidden = true;
    endpoint = path; currentJob = crypto.randomUUID().replaceAll('-', ''); setBusy(true);
    return { id: currentJob, version: revision };
  }
  $('#clips-generate').addEventListener('click', async () => {
    if (busy || externalBusy || !transcript || !file || !ready) return;
    const selectedTranscript = transcript, [minDuration, maxDuration] = $('#clips-length').value.split(',').map(Number);
    const task = await begin('highlights'); if (!task) return;
    status('Przygotowywanie analizy transkrypcji…'); stopPreview(true);
    try {
      const result = await post('highlights', { id: task.id, transcript: selectedTranscript, minDuration, maxDuration,
        count: Number($('#clips-count').value), focus: $('#clips-focus').value.trim(), engine: $('#clips-engine').value }, task.version);
      if (result) poll(result.id, task.version, 'highlights');
    } catch (error) { if (task.version === revision) fail(error.message); }
  });
  $('#clips-export').addEventListener('click', async () => {
    const chosen = proposals.filter(item => item.selected);
    if (busy || externalBusy || !file || !ready || !chosen.length || chosen.some(item => !validClipRange(item.start, item.end, video.duration))) return;
    const captionState = captions.getExportState();
    if ($('#clips-captions').checked && !captionState.enabled) { fail('Włącz napisy na wideo albo odznacz dodawanie napisów do klipów.'); return; }
    const payload = { clips: chosen.map(({id, title, start, end}) => ({id, title, start, end})), format: $('#clips-format').value,
      captions: $('#clips-captions').checked ? { settings: captionState.settings, cues: captionState.cues } : null };
    const chosenFile = file, task = await begin('clip-exports'); if (!task) return;
    clearDownloads(); stopPreview(true); captions.stopEditing(); status('Przygotowywanie eksportu klipów…');
    try {
      const result = await post('clip-exports', { id: task.id, ...payload }, task.version); if (!result || task.version !== revision) return;
      const xhr = new XMLHttpRequest(); upload = xhr;
      xhr.open('POST', `${api}/api/clip-exports/${task.id}/video`); xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-ClipsON-Client', '1');
      xhr.upload.onprogress = event => { if (task.version === revision && event.lengthComputable) status(`Przekazywanie wideo do lokalnego silnika… ${Math.round(event.loaded / event.total * 100)}%`, event.loaded / event.total); };
      xhr.onload = () => { if (task.version !== revision) return; upload = undefined;
        if (xhr.status === 202) poll(task.id, task.version, 'clip-exports');
        else { let message = 'Nie udało się przekazać wideo.'; try { message = JSON.parse(xhr.responseText).detail || message; } catch {} fail(message); } };
      xhr.onerror = () => { if (task.version === revision) fail('Utracono połączenie z lokalnym silnikiem.'); };
      xhr.send(chosenFile);
    } catch (error) { if (task.version === revision) fail(error.message); }
  });
  $('#clips-cancel').addEventListener('click', async () => { await cancel(); status('Zadanie anulowane.', 0); });
  $('#clips-select-all').addEventListener('click', () => { const select = !proposals.every(item => item.selected); proposals.forEach(item => { item.selected = select; }); render(); });
  $('#clips-engine').addEventListener('change', controls);
  for (const selector of ['#clips-format', '#clips-captions']) $(selector).addEventListener('change', clearDownloads);
  captions.onChange(clearDownloads);
  return {
    setFile(value) { void cancel(); file = value; transcript = undefined; proposals = []; clearDownloads(); stopPreview(true); render();
      $('#clips-progress-wrap').hidden = true; $('#clips-error').hidden = true; $('#clips-warning').hidden = true; controls(); },
    setTranscript(value) { void cancel(); transcript = value; proposals = []; clearDownloads(); stopPreview(); render(); $('#clips-progress-wrap').hidden = true; controls(); },
    setBackendReady(value, ai) { ready = value; aiReady = ai; controls(); },
    setExternalBusy(value) { externalBusy = value; controls(); },
  };
}
