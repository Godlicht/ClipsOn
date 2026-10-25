# ClipsON

Strona główna i lokalne studio transkrypcji wideo. Jasny oraz matowy ciemny motyw z fioletowymi akcentami. Bez kont, logowania, subskrypcji ani płatnego API.

## Uruchomienie transkrypcji

Wymagany Python 3.10–3.13 (sprawdzone na Windows / Python 3.12). Z katalogu głównego repozytorium:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
backend/.venv/Scripts/python.exe -m uvicorn backend.server:app --host 127.0.0.1 --port 8765
```

Otwórz http://127.0.0.1:8765, dodaj film i wybierz „Wykonaj transkrypcję”. Ten sam lokalny silnik obsługuje frontend pod https://clipson-studio.earthyash12.chatgpt.site. Przeglądarka może wymagać zgody na połączenie z siecią lokalną; jeśli ją blokuje, korzystaj z adresu lokalnego.

Na Windows dostępne są też skrypty `backend/setup.ps1` (instalacja) oraz `backend/run.ps1` (uruchomienie). Po restarcie komputera wystarczy ponownie uruchomić serwer. Modele pobierają się przy pierwszej transkrypcji i zajmują kilka GB miejsca. Nagrania nie są wysyłane do Hugging Face ani innych usług zewnętrznych.

Domyślnie używany jest **Whisper large-v3** i dopasowanie fonetyczne do języka. Model polski: `jonatasgrosman/wav2vec2-large-xlsr-53-polish`. CPU (`int8`) działa bez CUDA, ale długie materiały mogą przetwarzać się dłużej niż ich czas odtwarzania. Model Medium jest lżejszą opcją. Opcjonalne GPU wymaga zgodnego środowiska PyTorch/CUDA i ustawienia `CLIPSON_DEVICE=cuda` lub `auto` przed uruchomieniem serwera. Aplikacja nie instaluje CUDA automatycznie.

## Synchronizacja i dokładność

- Po lewej wideo, po prawej transkrypcja. Kliknięcie słowa przechodzi do jego czasu, a odtwarzanie podświetla bieżące słowo.
- WhisperX rozpoznaje mowę, następnie dopasowuje tekst do dźwięku przez forced alignment. Nie rozdzielamy słów równomiernie po długości zdania.
- Zachowany jest zegar wideo, w tym opóźniony początek ścieżki i cisza. Audio jest resamplowane do 16 kHz oraz przetwarzane w pięciominutowych fragmentach z dwusekundowym kontekstem. Czasy fragmentów wracają do bezwzględnych sekund nagrania.
- Eksport JSON zachowuje `start`, `end`, `score` i `timing` każdego słowa. Niedostępne czasy pozostają `null`; słowa są oznaczane w interfejsie. Nie są usuwane z tekstu tylko dlatego, że model nie umiał ich dopasować.
- Dokładność zapisu do milisekund nie oznacza gwarancji trafienia do jednej milisekundy. Szum, muzyka, nazwy własne, liczby i nakładające się głosy mogą powodować pomyłki. Przed publikacją napisów trzeba przejrzeć wynik.
- Generowanie klipów i wypalanie napisów pozostają kolejnymi etapami. Obecny JSON jest podstawą pod te funkcje.

## Pliki i prywatność

Aplikacja nie narzuca limitu wielkości pliku. Wideo trafia strumieniowo na lokalny dysk, a dźwięk jest czytany fragmentami, bez wczytywania całego nagrania do RAM. Ograniczeniem pozostają kodeki, możliwości przeglądarki, pamięć i wolny dysk. Wyodrębniony dźwięk PCM może zajmować więcej miejsca niż skompresowane audio.

Serwer słucha tylko na `127.0.0.1:8765` i przetwarza jeden materiał naraz. Kopie robocze wideo i audio są usuwane po zakończeniu, błędzie lub anulowaniu. Wyniki i logi są w `backend/.runtime/jobs`; zakończone zadania starsze niż godzinę są sprzątane przy kolejnym zadaniu w tej samej sesji serwera. Po awaryjnym zamknięciu mogą zostać pliki robocze, które można usunąć przy wyłączonym silniku. Modele są przechowywane w `backend/.runtime/models`. Te katalogi i środowisko Python są pomijane przez Git.

## Sam frontend

Node.js 20+, bez instalacji pakietów:

```powershell
cd web
node scripts/serve.mjs
```

Podgląd: http://127.0.0.1:5173. Transkrypcja wymaga równolegle uruchomionego backendu. Budowanie:

```powershell
node scripts/build.mjs
node scripts/serve.mjs --production
```

## Testy

Z katalogu głównego:

```powershell
node --test web/tests/*.test.js
backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests
```

Testy obejmują czas słów i ciszę, długie nagrania, zachowanie niedopasowanych słów, odpowiedź kończącą zadanie, anulowanie importu oraz rzeczywistą konwersję wideo z opóźnioną ścieżką audio. Ręcznie sprawdzono rozpoznawanie polskiej wypowiedzi oraz przechodzenie do słowa w przeglądarce.

## Struktura

- `web/index.html` — strona i okno importu z kolumną transkrypcji.
- `web/src/app.js` — motywy, demo i wybór pliku.
- `web/src/transcription.js` — lokalne API, wysyłka, postęp, anulowanie i podświetlanie.
- `web/src/transcript-utils.js` — aktywne słowo i formatowanie czasu.
- `web/src/transcription.css` — responsywne studio w obu motywach.
- `backend/server.py` — API, strumieniowy odbiór plików i zadania.
- `backend/worker.py` — rozpoznawanie oraz dopasowanie fonetyczne WhisperX.
- `backend/media.py`, `backend/timing.py` — zegar audio i scalanie czasów słów.

Dokumentacja silnika: https://github.com/m-bain/whisperX. Fonty Manrope i DM Sans pochodzą z Google Fonts; ilustracje i ikony to lokalne SVG.
