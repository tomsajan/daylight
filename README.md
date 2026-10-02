# Daylight

**How the days change, anywhere on Earth.**

An interactive web app showing sunrise, sunset, twilight and day length through the year for any place, on a
3D globe and charts, and every solar and lunar eclipse from 1980 to 2100 on a zoomable map. Live at
[daylight.tomsa.xyz](https://daylight.tomsa.xyz).

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
- **Eclipses:** solar and lunar eclipses 1980-2100 on a map you can zoom down to street level, with what each looks
  like from any place (see below).
- Works on phones; the whole state (places, time, speed) is in the URL, so a link shows the same view.

### Three designs of the same app

The start page lets you pick one, and each has a switcher that keeps your places, time and settings:

- **Observatory:** the globe fills the screen and everything else floats over it on glass.
- **Instrument:** a dense, precise console built around a comparison table.
- **Almanac:** daylight set in type like a printed almanac, with the year chart as the centrepiece.

**Reference** is the plain wiring of every shared component, for development, including a table of the solar
eclipses seen from the selected place and the Moon's shadow on the globe.

### Eclipses

A fourth page, [Eclipses](https://daylight.tomsa.xyz/designs/eclipse/), is about eclipses rather than daylight. A
switch at the top of its panel picks solar or lunar eclipses; each side has its own list, filters by type and can
list only the eclipses seen from the chosen place. Pick a place by searching or by clicking the map.

**Solar eclipses** (269, 1980-2100):

- On the map: the path of totality or annularity with its exact limits and central line, contours for every 10% of
  the Sun's diameter covered, and the Moon's shadow at the chosen time, carried on through twilight. Worked out per
  pixel, so the lines stay sharp down to street level.
- For a place: the contact times with the Sun's height and direction at each, sunrise or sunset during the eclipse,
  how much of the Sun is covered, how long totality or annularity lasts, how far it is to the central line and to
  the nearer limit, and a picture of the Sun and Moon as they will look from there.
- Hovering over the map tells what any spot gets.

**Lunar eclipses** (276, 1980-2100):

- On the map: how much of the eclipse each place sees, the lines where the Moon rises or sets at each contact
  (P1 to P4), the Moon's horizon at the chosen time, and the point under the Moon.
- For a place: the contact times with the Moon's height and direction at each, moonrise or moonset during the
  eclipse, how much of totality is seen, and the Moon's path through the Earth's shadow, turned to the place's sky.

Both:

- A timeline from the first contact anywhere to the last, with play at up to 30 minutes per second, and an option to
  keep the shadow (or the Moon) in view as it moves.
- Night shading in twilight bands or smooth, and several background maps: streets, light, dark, satellite and
  Mapy.com.
- In the sky picture, the horizon when the Sun or Moon is low; a slider sets how much the ground hides what is below
  it.
- The panel can be dragged wider for a bigger sky picture. A link keeps the eclipse, the place and the time, e.g.
  [the 2027 eclipse from Luxor](https://daylight.tomsa.xyz/designs/eclipse/?p=Luxor~Egypt~25.6870~32.6390&t=2027-08-02T10:05Z#2027-08-02).

## How it works

Everything is computed in the browser; there is no backend. The build is a static site that any web server or
static host can serve. The only network requests after loading go to OpenStreetMap services
([Photon](https://photon.komoot.io), with [Nominatim](https://nominatim.org) as a fallback for search), for place
search and for naming a spot clicked on the globe. Nominatim is only asked when you press Enter while Photon is
not answering, as its usage policy does not allow search-as-you-type. Time zones are
looked up offline. The Eclipses page also loads map tiles: [OpenFreeMap](https://openfreemap.org) (OpenStreetMap
data), the [Sentinel-2 cloudless](https://s2maps.eu) mosaic, or [Mapy.com](https://mapy.com).

Mapy.com needs an API key, free for modest use at [developer.mapy.com](https://developer.mapy.com). Either enter it
on the page, where it stays in that browser, or build with `VITE_MAPY_API_KEY=...`. A key built into a public site
should be restricted to that site's address in the Mapy.com account.

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

- `npm test`: sun and eclipse tests, against astronomy-engine and NASA's tables
- `npm run check`: type check
- `npm run build`: static site in `dist/`; `npm run preview` serves it

## Layout

```
src/core/            shared engine, used by every design
  astro/             sun position (NOAA/Meeus) and daily light: sunrise, sunset, twilights, polar day/night
  time/              time scales (local, UTC, mean & apparent solar time) and formatting
  geo/               places, time zone lookup, geocoding, "where am I"
  eclipse/           solar eclipses 1980-2100 from Besselian elements: local circumstances, central line, limits,
                     and the same maths in GLSL for drawing them per pixel; lunar eclipses 1980-2100
  state/             app state (places, time, simulation), persisted settings and panel sizes, URL sync
  globe/             Three.js globe renderer + Svelte wrapper
  charts/            year chart and day chart (canvas, zoomable, draggable sun)
  components/        place search, time and speed controls, settings panel, design switcher, splitter
designs/<name>/      one folder per design; each is its own page at /designs/<name>/
designs/eclipse/     the Eclipses page: MapLibre map, the eclipse layer drawn per pixel, panels and sky views
scripts/             fetch-eclipses.mjs: downloads NASA's eclipse data and ΔT, writes src/core/eclipse/data/
index.html           start page listing the designs
```

To add a design, create `designs/<name>/` with an `index.html`, a `main.ts` and a `meta.ts`. The build and the start
page pick it up automatically.

## Accuracy

Sun positions follow the NOAA solar calculator algorithms, and the tests compare them with
[astronomy-engine](https://github.com/cosinekitty/astronomy). Sunrise and sunset agree within about a minute,
which is less than the effect of local weather on refraction. Sunrise and sunset are found by sampling the sun's
altitude through each day rather than with a closed-form formula, so polar day, polar night and DST days work everywhere.

Eclipses are computed from NASA's Besselian elements. The tests compare them with NASA's own tables (central line and
limits within about a kilometre, durations within a fraction of a second) and with astronomy-engine (contact times
within seconds). Not modelled: the mountains and valleys on the Moon's limb, which move contacts by a second or two
and the path limits by up to a kilometre or two. For eclipses after the last measured ΔT, the Earth's rotation is
extrapolated, which shifts times by seconds and the path east or west by about half a kilometre per second.

Lunar eclipses use NASA's contact times and the Moon's place from Espenak and Meeus's elements. The Earth's shadow is
centred on the point opposite the Sun (astronomy-engine, with aberration) and sized to NASA's magnitudes; contacts
worked out from that geometry agree with NASA's within 20 seconds, and the Moon's altitude agrees with
astronomy-engine within 0.05°.

## Credits

- Earth imagery: NASA Blue Marble and Black Marble (public domain), as packaged by
  [three-globe](https://github.com/vasturiano/three-globe).
- Place search: data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via Photon by komoot and Nominatim.
- Time zones: [@photostructure/tz-lookup](https://github.com/photostructure/tz-lookup).
- Eclipse predictions by Fred Espenak (lunar eclipse elements with Jean Meeus), NASA's GSFC
  ([eclipse.gsfc.nasa.gov](https://eclipse.gsfc.nasa.gov)); ΔT from
  the [IERS](https://www.iers.org). `node scripts/fetch-eclipses.mjs` downloads both again.
- Eclipse maps: [MapLibre GL JS](https://maplibre.org); tiles from [OpenFreeMap](https://openfreemap.org)
  (© [OpenMapTiles](https://openmaptiles.org), data © OpenStreetMap contributors),
  [Sentinel-2 cloudless](https://s2maps.eu) by EOX (contains modified Copernicus Sentinel data) and
  [Mapy.com](https://mapy.com) (© Seznam.cz a.s. and others).
- Built with [Svelte](https://svelte.dev), [Three.js](https://threejs.org) and [Vite](https://vite.dev).

## License

[MIT](LICENSE). The Earth textures are public domain.
