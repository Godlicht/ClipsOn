import { activeWordIndex, isTimedWord, timeLabel } from './transcript-utils.js';

const terminalStates = new Set(['completed', 'failed', 'cancelled']);
const stages = {
  starting: 'Uruchamianie silnika…', extracting: 'Wyodrębnianie dźwięku…',
  loading: 'Ładowanie modeli rozpoznawania…', transcribing: 'Rozpoznawanie mowy…',
  aligning: 'Dopasowywanie słów do dźwięku…',
};

export function createTranscription(video) {
  const $ = (selector) => document.querySelector(selector);
  const startButton = $('#transcribe-button');
  const results = $('#transcript-results');
  const panel = $('.transcription-panel');
  const progress = $('#transcript-progress');
  // Local API only: media is never posted to the static hosting service.
  const api = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '8765'
    ? location.origin : 'http://127.0.0.1:8765';
  let file, ready = false, running = false, revision = 0, currentJob, upload;
  let pollTimer, frame, transcript, timedWords = [], active = -1, checking = false, launching = false;
  let activeRow;
  let followPlayback = true;
  const panelToggle = $('#transcript-toggle');
  const followBar = $('#transcript-followbar');
  const resumeFollow = $('#resume-transcript-follow');

  function setPanelVisible(visible) {
    panel.hidden = !visible;
    panelToggle.setAttribute('aria-checked', String(visible));
    $('.import-workspace').classList.toggle('transcript-hidden', !visible);
    try { localStorage.setItem('clipson-transcript-visible', String(visible)); } catch { /* Optional preference. */ }
    if (visible) scrollToActiveRow();
  }
  try { setPanelVisible(localStorage.getItem('clipson-transcript-visible') !== 'false'); }
  catch { setPanelVisible(true); }
  panelToggle.addEventListener('click', () => setPanelVisible(panel.hidden));

  function updateFollowControls() {
    followBar.hidden = !timedWords.length;
    resumeFollow.hidden = followPlayback;
    $('#transcript-follow-status').textContent = followPlayback ? 'Tekst podąża za nagraniem' : 'Przeglądasz tekst';
  }
  function pauseFollowing() {
    if (results.scrollHeight <= results.clientHeight || !timedWords.length) return;
    followPlayback = false;
    updateFollowControls();
  }
  results.addEventListener('wheel', pauseFollowing, { passive: true });
  results.addEventListener('touchmove', pauseFollowing, { passive: true });
  results.addEventListener('pointerdown', (event) => {
    // Includes a scrollbar drag; word/time buttons keep their normal seek action.
    if (event.target === results) pauseFollowing();
  });
  results.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)
        || (event.key === ' ' && event.target === results)) pauseFollowing();
  });
  resumeFollow.addEventListener('click', () => {
    followPlayback = true;
    updateFollowControls();
    scrollToActiveRow();
  });

  function announce(message) { $('#transcription-announcement').textContent = message; }
  function deviceLabel(data) {
    return data.device === 'cuda'
      ? `${(data.deviceName || 'NVIDIA').replace('NVIDIA GeForce ', '')} · GPU`
      : data.device === 'cpu' ? 'WhisperX · CPU' : 'WhisperX · połączono';
  }
  function updateControls() {
    startButton.disabled = !file || !ready || running;
    $('#transcript-language').disabled = running;
    $('#transcript-model').disabled = running;
    $('#download-transcript').hidden = !transcript;
  }
  function busy(value) {
    running = value;
    panel.setAttribute('aria-busy', String(value));
    $('#transcript-processing').hidden = !value;
    updateControls();
  }
  function reset() {
    transcript = undefined; timedWords = []; active = -1; activeRow = undefined;
    followPlayback = true;
    updateFollowControls();
    results.replaceChildren(); results.hidden = true;
    $('#transcript-empty').hidden = false;
    $('#transcription-error').hidden = true;
    $('#alignment-warning').hidden = true;
    $('#transcript-summary').textContent = 'Kliknij słowo, aby przejść do tego momentu.';
    startButton.innerHTML = '<svg><use href="#i-spark"/></svg> Wykonaj transkrypcję <svg><use href="#i-arrow"/></svg>';
    updateControls();
  }
  async function health() {
    if (checking) return;
    checking = true;
    $('#engine-status').textContent = 'Łączenie z silnikiem…';
    let runtime;
    try {
      const response = await fetch(`${api}/api/health`, { signal: AbortSignal.timeout(4000) });
      const data = await response.json();
      runtime = data;
      ready = response.ok && data.ready && data.engine === 'whisperx';
    } catch { ready = false; }
    $('#engine-status').textContent = ready ? deviceLabel(runtime) : 'WhisperX · offline';
    $('#engine-status').classList.toggle('connected', ready);
    $('#engine-setup').hidden = ready;
    checking = false;
    updateControls();
  }
  async function cancel() {
    revision++;
    clearTimeout(pollTimer);
    const job = currentJob;
    currentJob = undefined;
    upload?.abort(); upload = undefined;
    busy(false);
    if (job) {
      try { await fetch(`${api}/api/transcriptions/${job}`, { method: 'DELETE', headers: { 'X-ClipsON-Client': '1' }, signal: AbortSignal.timeout(10000) }); }
      catch { /* The backend also handles a disconnected upload. */ }
    }
  }
  function fail(message) {
    busy(false);
    $('#transcription-error').textContent = message;
    $('#transcription-error').hidden = false;
    $('#transcript-empty').hidden = true;
    announce('Transkrypcja nie została ukończona.');
  }
  function seek(time) {
    if (!Number.isFinite(time)) return;
    video.currentTime = time;
    updateHighlight();
  }
  function render(data) {
    transcript = data;
    timedWords = [];
    const fragment = document.createDocumentFragment();
    data.segments.forEach((segment) => {
      const row = document.createElement('div'); row.className = 'transcript-row';
      const time = document.createElement('button'); time.className = 'transcript-time';
      time.textContent = timeLabel(segment.start); time.title = `Przejdź do ${timeLabel(segment.start, true)}`;
      time.addEventListener('click', () => seek(segment.start)); row.append(time);
      const text = document.createElement('div'); text.className = 'transcript-words';
      if (segment.words?.length) {
        segment.words.forEach((word) => {
          const element = document.createElement('button'); element.className = 'transcript-word';
          element.textContent = word.text;
          if (isTimedWord(word)) {
            element.title = `${timeLabel(word.start, true)} — ${timeLabel(word.end, true)}`;
            element.addEventListener('click', () => seek(word.start));
            timedWords.push({ ...word, element, row });
          } else {
            element.disabled = true; element.classList.add('unaligned');
            element.title = 'Czas tego słowa wymaga sprawdzenia.';
          }
          text.append(element, document.createTextNode(' '));
        });
      } else { text.textContent = segment.text; }
      row.append(text); fragment.append(row);
    });
    timedWords.sort((a, b) => a.start - b.start);
    updateFollowControls();
    results.replaceChildren(fragment); results.hidden = false;
    $('#transcript-empty').hidden = true;
    busy(false);
    if (!data.segments.length) {
      const empty = document.createElement('p'); empty.className = 'no-speech';
      empty.textContent = 'W tym nagraniu nie wykryto mowy.'; results.append(empty);
    }
    const total = data.segments.reduce((count, segment) => count + (segment.words?.length || 0), 0);
    $('#transcript-summary').textContent = `${data.language.toUpperCase()} · ${total} słów · ${timeLabel(data.duration)}`;
    if (data.unalignedWords > 0) {
      $('#alignment-warning').textContent = `${data.unalignedWords} słów bez wiarygodnego czasu zaznaczono kropkowanym podkreśleniem. Sprawdź je przed tworzeniem napisów.`;
      $('#alignment-warning').hidden = false;
    }
    startButton.textContent = 'Wykonaj ponownie';
    announce('Transkrypcja jest gotowa.');
    updateHighlight();
  }
  function updateHighlight() {
    const index = activeWordIndex(timedWords, video.currentTime);
    if (index === active) return;
    if (active >= 0) timedWords[active]?.element.classList.remove('current-word');
    active = index;
    const word = index >= 0 ? timedWords[index] : undefined;
    if (word) {
      word.element.classList.add('current-word');
      if (activeRow !== word.row) {
        activeRow?.classList.remove('current-row'); activeRow = word.row;
        activeRow.classList.add('current-row');
        scrollToActiveRow();
      }
    } else { activeRow?.classList.remove('current-row'); activeRow = undefined; }
  }
  function scrollToActiveRow() {
    if (!followPlayback || panel.hidden || !activeRow) return;
    // Only follow while enabled. Highlighting stays live during manual reading.
    const y = activeRow.offsetTop;
    if (y < results.scrollTop || y + activeRow.offsetHeight > results.scrollTop + results.clientHeight) {
      results.scrollTop = Math.max(0, y - results.clientHeight * 0.3);
    }
  }
  function animationFrame() {
    updateHighlight();
    if (!video.paused) frame = requestAnimationFrame(animationFrame);
  }
  video.addEventListener('play', () => { cancelAnimationFrame(frame); animationFrame(); });
  for (const event of ['timeupdate', 'seeked', 'pause']) video.addEventListener(event, updateHighlight);
  video.addEventListener('pause', () => cancelAnimationFrame(frame));

  async function poll(job, requestRevision) {
    if (requestRevision !== revision) return;
    try {
      const response = await fetch(`${api}/api/transcriptions/${job}`, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (requestRevision !== revision) return;
      if (!response.ok) throw new Error(data.detail || 'Nie udało się odczytać transkrypcji.');
      if (data.device) $('#engine-status').textContent = deviceLabel(data);
      if (terminalStates.has(data.state)) {
        currentJob = undefined;
        if (data.state === 'completed') render(data.result);
        else if (data.state === 'failed') fail(data.error || 'Silnik nie ukończył transkrypcji.');
        else { busy(false); $('#transcript-empty').hidden = false; }
        return;
      }
      $('#transcript-stage').textContent = stages[data.stage] || stages.starting;
      if (data.chunks) {
        progress.max = data.chunks; progress.value = data.chunk - 1;
        $('#transcript-progress-label').textContent = `Fragment ${data.chunk} z ${data.chunks} · ${timeLabel(data.completedSeconds)} / ${timeLabel(data.duration)}`;
      } else {
        progress.removeAttribute('value');
        $('#transcript-progress-label').textContent = data.stage === 'loading'
          ? 'Pierwsze uruchomienie pobiera modele. Może to potrwać kilka minut.'
          : 'Możesz w tym czasie oglądać wideo.';
      }
      pollTimer = setTimeout(() => poll(job, requestRevision), 1000);
    } catch (error) {
      if (requestRevision !== revision) return;
      fail(`${error.message} Sprawdź, czy lokalny silnik nadal działa.`);
      // Keep the job id so cancellation/retry can still release the worker.
    }
  }
  startButton.addEventListener('click', async () => {
    if (!file || !ready || running || launching) return;
    launching = true;
    const chosenFile = file;
    await cancel();
    if (chosenFile !== file) { launching = false; return; }
    const requestRevision = revision;
    reset(); busy(true); $('#transcript-empty').hidden = true;
    $('#transcript-stage').textContent = 'Przekazywanie do lokalnego silnika…';
    $('#transcript-progress-label').textContent = 'Plik pozostaje na Twoim komputerze.';
    progress.removeAttribute('value');
    currentJob = crypto.randomUUID().replaceAll('-', '');
    const job = currentJob;
    const xhr = new XMLHttpRequest(); upload = xhr;
    xhr.open('POST', `${api}/api/transcriptions?identifier=${job}&language=${encodeURIComponent($('#transcript-language').value)}&model=${encodeURIComponent($('#transcript-model').value)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-ClipsON-Client', '1');
    xhr.upload.onprogress = (event) => {
      if (requestRevision !== revision) return;
      if (event.lengthComputable) {
        progress.max = event.total; progress.value = event.loaded;
        $('#transcript-progress-label').textContent = `${Math.round(event.loaded / event.total * 100)}% przekazane do lokalnego silnika`;
      }
    };
    xhr.onload = () => {
      if (requestRevision !== revision) return;
      upload = undefined;
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status !== 202) throw new Error(data.detail || 'Nie udało się rozpocząć transkrypcji.');
        progress.removeAttribute('value'); poll(data.id, requestRevision);
      } catch (error) { fail(error.message); }
    };
    xhr.onerror = () => { if (requestRevision === revision) fail('Nie udało się połączyć z lokalnym silnikiem. Sprawdź, czy jest uruchomiony.'); };
    xhr.send(chosenFile);
    launching = false;
    announce('Rozpoczęto transkrypcję.');
  });
  $('#cancel-transcription').addEventListener('click', async () => {
    await cancel(); $('#transcript-empty').hidden = false; announce('Transkrypcja anulowana.');
  });
  $('#check-engine').addEventListener('click', health);
  $('#download-transcript').addEventListener('click', () => {
    if (!transcript) return;
    const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${file.name.replace(/\.[^.]+$/, '')}.transcript.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return {
    health,
    setFile(nextFile) { void cancel(); file = nextFile; reset(); },
  };
}
