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
- Dostępne są automatyczne propozycje klipów na podstawie transkrypcji, edycja cięć oraz eksport MP4 z animowanymi napisami.

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
- Fioletowy puls, Błękitny akcent i Limonka: trzy kolejne kolory podświetlenia na czarnym tle.
- Różowy obrys i Czerwony obrys: kolorowe podświetlenie wypowiadanego słowa bez tła. Neon: błękitny akcent z obrysem.
- Wielkość 2–20% wysokości obrazu, szerokość pola 20–96%, 2–6 słów na ekranie i opcjonalny efekt pop. Długie słowa automatycznie dopasowują się do pola.

Przycisk „Edytuj na ekranie” wstrzymuje wideo i pokazuje ramkę. Przeciągnij jej środek, aby przesunąć napisy; boczne uchwyty zmieniają szerokość i podział wierszy, a narożniki skalują tekst. Ramka pozostaje w granicach rzeczywistego obrazu, także w pionowym wideo i na pełnym ekranie. Strzałki przesuwają zaznaczoną ramkę (Shift zwiększa krok); na uchwytach zmieniają szerokość lub wielkość. Esc kończy edycję. W przerwie mowy edycja pokazuje ostatnią frazę bez przesuwania nagrania. „Przywróć układ” przywraca początkowe położenie, rozmiar i szerokość. Te ustawienia oraz podział wierszy są uwzględniane w MP4; czasy słów pozostają bez zmian.

Podgląd mieści napisy w rzeczywistym obrazie wideo, poza czarnymi pasami, i ma własny przycisk pełnego ekranu obejmujący warstwę napisów. Przerwy w mowie nie powodują przesuwania późniejszych czasów; słowa bez dopasowanego czasu mogą być widoczne jako kontekst frazy, ale nie dostają wymyślonego momentu podświetlenia.

„Eksportuj film z napisami” tworzy lokalnie nowy MP4 (H.264 / AAC) z wtopionymi napisami; oryginał nie jest modyfikowany. FFmpeg/libass renderuje podświetlanie oraz animację według bezwzględnych czasów. Format ASS zapisuje czas co 0,01 s, więc może wystąpić zaokrąglenie do 5 ms bez kumulowania przesunięcia. Typografia i kształt czarnego tła mogą nieznacznie różnić się między CSS przeglądarki i libass. Kodowanie używa NVIDIA NVENC, jeśli test sprzętu przechodzi, a w przeciwnym razie libx264; to wybór kodera eksportu, niezależny od urządzenia WhisperX.

Po eksporcie użyj „Pobierz MP4”. Eksport ma rzeczywisty postęp z FFmpeg i obsługę anulowania. Materiał i dane napisów trafiają wyłącznie do lokalnego silnika. Aplikacja przetwarza jeden materiał naraz, więc transkrypcja i eksport nie obciążają silnika jednocześnie. Film wynikowy pozostaje w katalogu zadania do sprzątnięcia zgodnie z zasadami plików roboczych opisanymi powyżej. Wideo nie ma limitu rozmiaru narzuconego przez aplikację; dane JSON napisów mają limit 20 MB.

Moduły: `web/src/captions.js`, `web/src/caption-utils.js`, `web/src/captions.css`, `backend/caption_export.py` oraz `backend/caption_worker.py`.

## Wybór najciekawszych momentów i tworzenie klipów

Po transkrypcji lub imporcie JSON wybierz długość, liczbę propozycji i opcjonalnie temat (np. praktyczne porady). „Znajdź najciekawsze momenty” uruchamia lokalną analizę; plik wideo nie jest potrzebny do samego oceniania tekstu. Wideo jest przekazywane do lokalnego silnika dopiero przy eksporcie.

Tryb AI używa [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507), na licencji Apache 2.0. Jednorazowo pobierz około 8 GB wag:

```powershell
powershell -File backend/setup-clips.ps1
```

Po pobraniu uruchom ponownie backend. Model jest w `backend/.runtime/models/highlights`, poza Git. Korzysta z PyTorch i Transformers z istniejącego środowiska (Transformers 4.57+); nie wykonuje zdalnego kodu modelu. Pobieranie używa konkretnej rewizji, zapisanej w `clipson-model.json`. Po instalacji wagi i tokenizer są odczytywane wyłącznie lokalnie. AI wybiera GPU według `CLIPSON_DEVICE`, tak jak WhisperX; na CPU będzie znacznie wolniejsze. Proces kończy się po analizie i zwalnia pamięć GPU. Transkrypcja, analiza AI i eksport są wykonywane kolejno przez wspólny menedżer zadań.

Tryb „Szybka analiza tekstu” działa bez dodatkowego modelu: ocenia pytania, porady, historie i kontrasty, obniżając ocenę powitań i autopromocji. Jest oznaczony osobno i nie udaje analizy AI. W trybie AI brak wag lub nieprawidłowa odpowiedź modelu daje komunikat błędu; aplikacja nie przełącza się po cichu na reguły.

Granice propozycji powstają z oryginalnych czasów słów i interpunkcji. Długie wypowiedzi są dzielone na krótsze jednostki, kandydaci są rozdzielani po całym nagraniu i ograniczani do 96 przed oceną modelu (partie do 8). To nie jest analiza obrazu, emocji głosu ani gwarancja popularności; warto obejrzeć propozycje. Model zwraca wyłącznie identyfikatory istniejących kandydatów, tytuły, uzasadnienia i ocenę redakcyjną. Czasy ani cytaty wygenerowane przez model nie są przyjmowane. Filtrowanie usuwa nakładające się propozycje. Krótkie wypowiedzi mogą dać mniej lub krótsze klipy; aplikacja nie powiela wyników ani nie dopełnia ich ciszą.

„Podgląd fragmentu” odtwarza wycinek w głównym podglądzie oryginalnego kadru i zatrzymuje na jego końcu. „Całe wideo” wychodzi z podglądu fragmentu. W „Popraw cięcie” można podać początek i koniec w sekundach lub pobrać je z odtwarzacza. Eksport dopuszcza klipy 0,5–180 s mieszczące się w rzeczywistej długości pliku.

„Utwórz zaznaczone klipy” przesyła źródło strumieniowo tylko raz dla całej partii i tworzy do 8 osobnych MP4 (H.264/AAC) oraz ZIP z plikami i manifestem `klipy.json`. Dostępne są oryginalny kadr i pion 720×1280 z pełnym obrazem na rozmytym tle (bez śledzenia twarzy). Napisy używają bieżącego szablonu, położenia i wielkości; w pionie współrzędne odnoszą się do kadru wyjściowego. Czasy napisów są przycinane do zakresu i odejmowany jest dokładny początek klipu, bez sumowania zaokrągleń. FFmpeg wykonuje dokładne cięcie przez ponowne kodowanie; preferuje NVIDIA NVENC. Nie modyfikuje oryginału.

Interfejs pokazuje postęp analizy i rzeczywisty postęp kodowania, pozwala anulować zadanie, pobrać każdy MP4 lub całą paczkę ZIP. Zmiana wyglądu napisów, zakresów lub formatu usuwa stare linki z bieżącego widoku, aby wymusić ponowny eksport. Obowiązują te same zasady sprzątania wyników i brak limitu GB jak przy eksporcie napisów. Metadane JSON mają limit 20 MB. Kopia robocza wideo jest usuwana po zakończeniu, niepowodzeniu lub anulowaniu; wyniki wygasają przy sprzątaniu po godzinie w tej samej sesji backendu.

Moduły: `backend/highlights.py`, `backend/highlight_model.py`, `backend/highlight_worker.py`, `backend/clip_export.py`, `backend/clip_worker.py`, `web/src/clips.js` i `web/src/clips.css`.
