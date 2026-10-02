# Daylight

**How the days change, anywhere on Earth.**

An interactive web app showing sunrise, sunset, twilight and day length through the year for any place, on a
3D globe and charts. Live at [daylight.tomsa.xyz](https://daylight.tomsa.xyz).

- **3D globe** with the live day/night line, twilight zones, city lights at night and the point where the sun is overhead.
- **Year chart** in three modes: sunrise, sunset and twilight bands; hours of daylight; and the **daily change**, how
  much daylight is gained or lost each day, split into the part won in the morning (sunrise moving) and in the
  evening (sunset moving).
- **Day chart** of the sun's altitude, hour by hour.
- **Time simulation** from real time up to a month per second, forwards or backwards. Drag the sun in either chart to
  move through time.
- **Compare up to six places** on the same charts.
- **Clocks:** local time (with daylight saving), UTC, mean solar time or apparent solar (sundial) time.
- Zoomable charts and globe, resizable panels, adjustable day and night brightness, light and dark themes.
- Works on phones; the whole state (places, time, speed) is in the URL, so a link shows the same view.

### Three designs of the same app

The start page lets you pick one, and each has a switcher that keeps your places, time and settings:

- **Observatory:** the globe fills the screen and everything else floats over it on glass.
- **Instrument:** a dense, precise console built around a comparison table.
- **Almanac:** daylight set in type like a printed almanac, with the year chart as the centrepiece.

A fourth, **Reference**, is the plain wiring of every shared component, for development.

## How it works

Everything is computed in the browser; there is no backend. The build is a static site that any web server or
static host can serve. The only network requests after loading go to OpenStreetMap services
([Photon](https://photon.komoot.io), with [Nominatim](https://nominatim.org) as a fallback for search), for place
search and for naming a spot clicked on the globe. Nominatim is only asked when you press Enter while Photon is
not answering, as its usage policy does not allow search-as-you-type. Time zones are
looked up offline.

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

Other commands:

- `npm test`: solar math tests
- `npm run check`: type check
- `npm run build`: static site in `dist/`; `npm run preview` serves it

## Layout

```
src/core/            shared engine, used by every design
  astro/             sun position (NOAA/Meeus) and daily light: sunrise, sunset, twilights, polar day/night
  time/              time scales (local, UTC, mean & apparent solar time) and formatting
  geo/               places, time zone lookup, geocoding, "where am I"
  eclipse/           solar eclipses 1980-2100 from Besselian elements: local circumstances, central line, limits
  state/             app state (places, time, simulation), persisted settings and panel sizes, URL sync
  globe/             Three.js globe renderer + Svelte wrapper
  charts/            year chart and day chart (canvas, zoomable, draggable sun)
  components/        place search, time and speed controls, settings panel, design switcher, splitter
designs/<name>/      one folder per design; each is its own page at /designs/<name>/
index.html           start page listing the designs
```

To add a design, create `designs/<name>/` with an `index.html`, a `main.ts` and a `meta.ts`. The build and the start
page pick it up automatically.

## Accuracy

Sun positions follow the NOAA solar calculator algorithms, and the tests compare them with
[astronomy-engine](https://github.com/cosinekitty/astronomy). Sunrise and sunset agree within about a minute,
which is less than the effect of local weather on refraction. Sunrise and sunset are found by sampling the sun's
altitude through each day rather than with a closed-form formula, so polar day, polar night and DST days work everywhere.

## Credits

- Earth imagery: NASA Blue Marble and Black Marble (public domain), as packaged by
  [three-globe](https://github.com/vasturiano/three-globe).
- Place search: data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via Photon by komoot and Nominatim.
- Time zones: [@photostructure/tz-lookup](https://github.com/photostructure/tz-lookup).
- Eclipse predictions by Fred Espenak, NASA's GSFC ([eclipse.gsfc.nasa.gov](https://eclipse.gsfc.nasa.gov)); ΔT from
  the [IERS](https://www.iers.org). `node scripts/fetch-eclipses.mjs` downloads both again.
- Built with [Svelte](https://svelte.dev), [Three.js](https://threejs.org) and [Vite](https://vite.dev).

## License

[MIT](LICENSE). The Earth textures are public domain.
