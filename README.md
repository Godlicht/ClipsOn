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

Domyślnie używany jest **Whisper large-v3** i dopasowanie fonetyczne do języka. Model polski: `jonatasgrosman/wav2vec2-large-xlsr-53-polish`. Domyślne urządzenie to `auto`: NVIDIA GPU, gdy oba silniki widzą CUDA, albo CPU (`int8`). GPU używa `float16` do rozpoznawania mowy; dopasowanie fonetyczne również działa na GPU. Rzeczywiste urządzenie jest widoczne w interfejsie i zapisywane w wyniku JSON. Wymuszone `CLIPSON_DEVICE=cuda` zgłasza błąd zamiast przechodzić po cichu na CPU.

## Synchronizacja i dokładność

- Po lewej wideo, po prawej transkrypcja. Kliknięcie słowa przechodzi do jego czasu, a odtwarzanie podświetla bieżące słowo.
- Suwak „Panel transkrypcji” ukrywa i pokazuje panel bez utraty tekstu i bez zatrzymywania nagrania. Widoczność jest zapamiętywana lokalnie.
- Ręczne przewijanie kółkiem, dotykiem, klawiaturą lub paskiem przewijania wstrzymuje automatyczne przewijanie, zachowując podświetlanie słów. „Wróć do odtwarzania” ponownie włącza śledzenie.
- WhisperX rozpoznaje mowę, następnie dopasowuje tekst do dźwięku przez forced alignment. Nie rozdzielamy słów równomiernie po długości zdania.
- Zachowany jest zegar wideo, w tym opóźniony początek ścieżki i cisza. Audio jest resamplowane do 16 kHz oraz przetwarzane w pięciominutowych fragmentach z dwusekundowym kontekstem. Czasy fragmentów wracają do bezwzględnych sekund nagrania.
- Eksport JSON zachowuje `start`, `end`, `score` i `timing` każdego słowa. Niedostępne czasy pozostają `null`; słowa są oznaczane w interfejsie. Nie są usuwane z tekstu tylko dlatego, że model nie umiał ich dopasować.
- Dokładność zapisu do milisekund nie oznacza gwarancji trafienia do jednej milisekundy. Szum, muzyka, nazwy własne, liczby i nakładające się głosy mogą powodować pomyłki. Przed publikacją napisów trzeba przejrzeć wynik.
- Generowanie klipów pozostaje kolejnym etapem. Animowane napisy są już dostępne w podglądzie i w eksporcie MP4.

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

## Przyspieszenie NVIDIA GPU

`backend/setup.ps1` domyślnie wykrywa kartę NVIDIA i instaluje zgodny z WhisperX PyTorch 2.8 z CUDA 12.8. Można wymusić `-Device cuda` lub wybrać `-Device cpu`. Bez skryptu, po instalacji requirements:

```powershell
backend/.venv/Scripts/python.exe -m pip install --upgrade torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128
```

`backend/run.ps1 -Device cuda` wymaga GPU. Zwykłe uruchomienie i domyślne `-Device auto` wybierają dostępny sprzęt. Biblioteki cuBLAS/cuDNN z pakietu PyTorch udostępniamy procesowi CTranslate2 bez zmiany systemowego PATH i bez instalacji pełnego CUDA Toolkit. Sterownik NVIDIA musi być zgodny z CUDA 12.8. Plik `backend/runtime.py` sprawdza dostępność CUDA w PyTorch i CTranslate2, ponieważ samo wykrycie karty przez sterownik nie wystarcza.
## Animowane napisy

Po wybraniu wideo wykonaj transkrypcję lub użyj „Wczytaj transkrypcję JSON” z wynikiem zapisanym dla tego samego nagrania. Import zachowuje oryginalny zegar słów; nie dopasowuje transkrypcji z innego pliku. Wybierz „Animowane napisy”, szablon oraz ustawienia:

- Żółty akcent: biały tekst na czarnym tle, bieżące słowo żółte.
- Czerwony akcent: biały tekst na czarnym tle, bieżące słowo czerwone.
- Klasyczny obrys: biały tekst z czarnym obrysem, bieżące słowo żółte.
- Wielkość 4–10% wysokości obrazu, położenie dół/środek/góra, 2–6 słów na ekranie i opcjonalny efekt pop.

Podgląd mieści napisy w rzeczywistym obrazie wideo, poza czarnymi pasami, i ma własny przycisk pełnego ekranu obejmujący warstwę napisów. Przerwy w mowie nie powodują przesuwania późniejszych czasów; słowa bez dopasowanego czasu mogą być widoczne jako kontekst frazy, ale nie dostają wymyślonego momentu podświetlenia.

„Eksportuj film z napisami” tworzy lokalnie nowy MP4 (H.264 / AAC) z wtopionymi napisami; oryginał nie jest modyfikowany. FFmpeg/libass renderuje podświetlanie oraz animację według bezwzględnych czasów. Format ASS zapisuje czas co 0,01 s, więc może wystąpić zaokrąglenie do 5 ms bez kumulowania przesunięcia. Typografia i kształt czarnego tła mogą nieznacznie różnić się między CSS przeglądarki i libass. Kodowanie używa NVIDIA NVENC, jeśli test sprzętu przechodzi, a w przeciwnym razie libx264; to wybór kodera eksportu, niezależny od urządzenia WhisperX.

Po eksporcie użyj „Pobierz MP4”. Eksport ma rzeczywisty postęp z FFmpeg i obsługę anulowania. Materiał i dane napisów trafiają wyłącznie do lokalnego silnika. Aplikacja przetwarza jeden materiał naraz, więc transkrypcja i eksport nie obciążają silnika jednocześnie. Film wynikowy pozostaje w katalogu zadania do sprzątnięcia zgodnie z zasadami plików roboczych opisanymi powyżej. Wideo nie ma limitu rozmiaru narzuconego przez aplikację; dane JSON napisów mają limit 20 MB.

Moduły: `web/src/captions.js`, `web/src/caption-utils.js`, `web/src/captions.css`, `backend/caption_export.py` oraz `backend/caption_worker.py`.