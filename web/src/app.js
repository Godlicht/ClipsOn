const $ = (selector) => document.querySelector(selector);
const themeButton = $('.theme-toggle');
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.setAttribute('aria-label', dark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw');
  themeButton.setAttribute('title', dark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw');
  $('meta[name="theme-color"]').content = dark ? '#111114' : '#fdfcfe';
}
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('clipson-theme', theme); } catch { /* Storage is optional. */ }
  updateThemeButton();
});
updateThemeButton();
$('#year').textContent = new Date().getFullYear();

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else { document.body.classList.add('no-observer'); }

const waveform = $('#waveform');
for (let i = 0; i < 95; i++) {
  const bar = document.createElement('i');
  bar.style.height = `${18 + Math.abs(Math.sin(i * 1.71) * Math.cos(i * 0.31)) * 80}%`;
  waveform.append(bar);
}

let animationTimer;
let playing = false;
const sceneButton = $('#scene-play');
function stopAnimation() {
  playing = false;
  clearInterval(animationTimer);
  $('.hero').classList.remove('is-playing');
  sceneButton.innerHTML = '<svg><use href="#i-play"/></svg>';
  sceneButton.setAttribute('aria-label', 'Odtwórz animację demonstracyjną');
  $('#demo-time').textContent = '00:42';
}
sceneButton.addEventListener('click', () => {
  if (playing) { stopAnimation(); return; }
  playing = true;
  $('.hero').classList.add('is-playing');
  sceneButton.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12" stroke-width="3"/></svg>';
  sceneButton.setAttribute('aria-label', 'Zatrzymaj animację demonstracyjną');
  let seconds = 42;
  animationTimer = setInterval(() => {
    seconds = seconds >= 69 ? 42 : seconds + 1;
    $('#demo-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 1000);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAnimation(); });

const uploadDialog = $('#upload-dialog');
const demoDialog = $('#demo-dialog');
const fileInput = $('#video-input');
const video = $('#local-video');
const dropzone = $('#dropzone');
const error = $('#upload-error');
let objectURL;
let selectedFile;
let lastTrigger;

function openDialog(dialog, trigger) {
  lastTrigger = trigger || document.activeElement;
  stopAnimation();
  dialog.showModal();
}
document.querySelectorAll('[data-upload]').forEach((button) => {
  button.addEventListener('click', () => openDialog(uploadDialog, button));
});
$('#demo-button').addEventListener('click', (event) => openDialog(demoDialog, event.currentTarget));
$('#demo-upload').addEventListener('click', () => {
  demoDialog.close();
  openDialog(uploadDialog, $('#demo-button'));
});
document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (dialog === uploadDialog) video.pause();
    lastTrigger?.focus();
  });
});
$('#choose-file').addEventListener('click', () => fileInput.click());
$('#change-file').addEventListener('click', () => fileInput.click());
function showError(message) { error.textContent = message; error.hidden = false; }
function readableSize(bytes) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function selectFile(file) {
  if (!file) return;
  error.hidden = true;
  const allowedExtension = /\.(mp4|m4v|mov|webm|mkv|avi|ogv|ogg|mpeg|mpg)$/i.test(file.name);
  if (!(file.type.startsWith('video/') || allowedExtension)) {
    showError('Wybierz plik wideo, np. MP4, MOV lub WEBM.'); return;
  }
  if (file.size === 0) { showError('Ten plik jest pusty. Wybierz inne wideo.'); return; }
  if (file.size > 2 * 1024 ** 3) { showError('Ten plik ma więcej niż 2 GB. Wybierz mniejszy materiał.'); return; }
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (objectURL) URL.revokeObjectURL(objectURL);
  selectedFile = file;
  objectURL = URL.createObjectURL(file);
  $('#file-name').textContent = file.name;
  $('#file-info').textContent = `${readableSize(file.size)} · Lokalny podgląd`;
  video.src = objectURL;
  dropzone.hidden = true;
  $('#uploaded-preview').hidden = false;
}
fileInput.addEventListener('change', () => { selectFile(fileInput.files[0]); fileInput.value = ''; });
video.addEventListener('loadedmetadata', () => {
  if (!selectedFile) return;
  const duration = Number.isFinite(video.duration) ? `${Math.floor(video.duration / 60)}:${String(Math.floor(video.duration % 60)).padStart(2, '0')}` : '—';
  $('#file-info').textContent = `${readableSize(selectedFile.size)} · ${duration} · ${video.videoWidth} × ${video.videoHeight}`;
});
video.addEventListener('error', () => {
  if (video.getAttribute('src')) showError('Ta przeglądarka nie odtwarza kodeka tego wideo. Spróbuj pliku MP4 z kodekiem H.264 lub WEBM.');
});
let dragDepth = 0;
// Accept a replacement dropped anywhere inside the import dialog as well.
uploadDialog.addEventListener('dragenter', (event) => { event.preventDefault(); dragDepth++; dropzone.classList.add('dragover'); });
uploadDialog.addEventListener('dragover', (event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
uploadDialog.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove('dragover'); } });
uploadDialog.addEventListener('drop', (event) => {
  event.preventDefault(); dragDepth = 0; dropzone.classList.remove('dragover');
  if (event.dataTransfer.files.length > 1) { showError('Dodaj jedno wideo na raz.'); return; }
  selectFile(event.dataTransfer.files[0]);
});
window.addEventListener('pagehide', () => { if (objectURL) URL.revokeObjectURL(objectURL); });

const captions = ['Wyjdź poza <mark>szlak.</mark>', 'Zrób pierwszy <mark>krok.</mark>', 'Odkrywaj po <mark>drodze.</mark>'];
document.querySelectorAll('.demo-quote').forEach((button) => {
  button.setAttribute('aria-pressed', String(button.classList.contains('active')));
  button.addEventListener('click', () => {
    document.querySelectorAll('.demo-quote').forEach((quote) => { quote.classList.remove('active'); quote.setAttribute('aria-pressed', 'false'); });
    button.classList.add('active');
    button.setAttribute('aria-pressed', 'true');
    $('#demo-caption').innerHTML = captions[Number(button.dataset.quote)];
  });
});
