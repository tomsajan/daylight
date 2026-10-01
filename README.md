# Daylight

An interactive web app for understanding how daylight changes through the year, anywhere on Earth:
a 3D globe with the live day/night line and twilight zones, a zoomable year chart of sunrise, sunset
and twilight, a day chart of the sun's altitude, place search, comparing up to six places, and a
time simulation from real time up to a month per second.

Everything runs in the browser. The internet is used only for place search (OpenStreetMap via Photon/Nominatim).

## Running locally

Node.js lives inside a Python virtualenv in the project (via `nodeenv`), so nothing is installed system-wide.

```bash
# one-time setup
python3 -m venv .venv
.venv/bin/pip install nodeenv
.venv/bin/nodeenv -p --node=lts
source .venv/bin/activate
npm install

# every time
source .venv/bin/activate
npm run dev          # http://localhost:5173
```

Other commands: `npm test` (solar math tests), `npm run check` (type check), `npm run build` (static site in `dist/`).

## Layout

```
src/core/            shared engine, used by every design
  astro/             sun position (NOAA/Meeus) and daily light: sunrise, sunset, twilights, polar day/night
  time/              time scales (local, UTC, mean & apparent solar time) and formatting
  geo/               places, time zone lookup, geocoding, "where am I"
  state/             app state (places, time, simulation), persisted settings, URL sync, derived views
  globe/             Three.js globe renderer + Svelte wrapper
  charts/            year chart and day chart (canvas, zoomable)
  components/        place search, time controls, settings panel
designs/<name>/      one folder per UI design; each is its own page at /designs/<name>/
index.html           lists the designs
```

## Accuracy

Sun positions follow the NOAA solar calculator algorithms, and the tests compare them with
[astronomy-engine](https://github.com/cosinekitty/astronomy). Sunrise and sunset agree within about a minute,
which is less than the effect of local weather on refraction. Sunrise and sunset are found by sampling the sun's
altitude through each day rather than with a closed-form formula, so polar day, polar night and DST days work everywhere.
