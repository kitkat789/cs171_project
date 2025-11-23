# Same City, Different Worlds — San Francisco Resource Story

Interactive, client-side dashboard that layers San Francisco businesses, parks, civic facilities, schools, and housing/rent burden to show how resources cluster by ZIP code and neighborhood.

## Quick start
- Requires a modern browser; all data is preprocessed into `data/processed/*.json`.
- In VS Code, right-click `index.html` and choose **Open with Live Server** (from the Live Server extension). The page will open in your browser at a local URL (typically `http://127.0.0.1:5500/`).
- Navigate the story sections or use the Guided Tour controls; maps, charts, and narration run entirely in the browser.

## Data prep (optional)
Preprocessed JSONs are already in `data/processed`. To regenerate them from the raw CSVs in `data/`:
```bash
python3 scripts/preprocess_data.py
```
The script uses only the Python 3 standard library (csv/json/re/etc.) and writes the derived files back to `data/processed`.

## Libraries used
- D3 v7.9 (via CDN) for charts and scales.
- Leaflet v1.9 (via CDN) for interactive maps and tooltips/popups.
- Browser Speech Synthesis API (if available) for optional narrated tour audio.
- No bundler or build step—`js/main.js` loads as an ES module directly in the browser.

## Project layout
- `index.html` – page markup and library includes.
- `css/style.css` – layout, typography, map/chart theming.
- `js/main.js` – visualization logic, guided tour, map/chart rendering, and data loading.
- `data/` – raw CSV inputs plus processed JSON outputs (in `data/processed/`).
- `scripts/preprocess_data.py` – helper to turn raw CSVs into the JSON payloads consumed by the UI.

## Notes and troubleshooting
- If the page fails to load data, ensure you are serving from `http://` (not `file://`) so `fetch` can read the JSON files.
- Data freshness depends on the CSV snapshots in `data/`; rerun the preprocessing script after updating them.
