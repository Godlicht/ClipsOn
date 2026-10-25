# ClipsON

Responsywna strona główna aplikacji do tworzenia krótkich klipów na podstawie transkrypcji wideo. Biały i matowy ciemny motyw z fioletowymi akcentami. Bez kont, logowania i subskrypcji.

## Uruchomienie

Wymagany Node.js 20 lub nowszy. Projekt nie potrzebuje instalacji zależności.

```powershell
cd web
npm run dev
```

Podgląd: http://127.0.0.1:5173

Jeśli `npm` nie jest dostępny, te same operacje wykonasz bezpośrednio:

```powershell
cd web
node scripts/serve.mjs
# W osobnym terminalu, do sprawdzenia i zbudowania:
node --check src/app.js
node scripts/build.mjs
# Podgląd zbudowanych plików:
node scripts/serve.mjs --production
```

```powershell
npm run check
npm run build
npm start
```

## Struktura

- `web/index.html` — strona, nawigacja i okna importu oraz demonstracji.
- `web/src/styles.css` — responsywny interfejs, motywy i animacje.
- `web/src/app.js` — zapamiętywanie motywu, demonstracja, import i podgląd wideo.
- `web/public/` — lokalna ilustracja wideo i ikona aplikacji.
- `web/scripts/` — serwer lokalny i budowanie wersji produkcyjnej.
- `web/dist/` — generowana wersja do hostingu statycznego.

## Gotowy zakres

Strona główna, oba motywy, animacje z obsługą ograniczenia ruchu, nawigacja sekcji, FAQ i interaktywne demo z trzema fragmentami przykładowej transkrypcji. Wybór lub przeciągnięcie wideo otwiera prawdziwy lokalny podgląd z nazwą, rozmiarem, czasem trwania i rozdzielczością. Aplikacja nie narzuca limitu rozmiaru pliku; dostępność odtwarzania zależy od kodeków i możliwości przeglądarki. Wideo pozostaje na urządzeniu i nie jest przesyłane na serwer.

## Kolejny etap aplikacji

Automatyczna transkrypcja, analiza tekstu i generowanie/eksport klipów nie są jeszcze zaimplementowane. To przygotowany frontend. Przyszłe API można podłączyć w obsłudze wyboru pliku w `web/src/app.js`; wymagane będą rzeczywiste stany przetwarzania, błędów i wyników. Nie ma atrap przetwarzania ani fikcyjnego eksportu.

Fonty DM Sans i Manrope pobierane są z Google Fonts, z lokalnymi fontami systemowymi jako fallback. Ilustracja gór i ikony są plikami SVG dołączonymi do projektu.
