# Planetarium

A web planetarium that shows the real sky for any date, time and place, with a telescope eyepiece simulator: pick a real telescope, eyepiece and Barlow and see what each change does to the view.

![The summer Milky Way over Sagittarius and Scorpius from a dark site](docs/sky.png)

| Pleiades, Evostar 80ED and 25 mm eyepiece | Moon, 8-inch Dobsonian and 25 mm eyepiece |
| --- | --- |
| ![Pleiades through an 80 mm apochromat, with the equipment panel](docs/telescope-pleiades.png) | ![Crescent Moon with relief through an 8-inch Dobsonian](docs/telescope-moon.png) |

![Saturn through a NexStar 8SE with a 10 mm eyepiece and a ×2 Barlow](docs/telescope-saturn.png)

![Evening twilight with the settings panel open](docs/twilight.png)

**Live demo:** [pscactux.github.io/planetarium](https://pscactux.github.io/planetarium/)

Built with Vite, TypeScript and three.js. No backend, no tracking, no API keys.

## Features

- The sky from the ground: drag to look around, scroll or pinch to zoom, ground with a horizon and cardinal points.
- About 9,100 stars from the Yale Bright Star Catalogue, sized by magnitude and tinted by colour index (B−V).
- The Milky Way from NASA's Deep Star Maps, fading with twilight, moonless darkness and the light pollution of the site (Bortle 2 to 8).
- 133 deep-sky objects: the whole Messier catalogue plus showpieces such as the Double Cluster, Omega Centauri, the Magellanic Clouds and the Helix Nebula. They are drawn with their real size, shape and orientation, the way they look through an eyepiece: soft galaxies, globular clusters that break into stars with aperture and magnification, nebulae and planetary rings. Whether one shows depends on its surface brightness, the sky and the telescope.
- Textured Moon and planets with their real orientation (IAU pole and rotation), phases and limb darkening. The Moon has NASA LRO relief and earthshine; Saturn's rings tilt as they really do and are shadowed by the globe; Jupiter's four big moons are in their true places.
- Constellation lines and names, plus IAU names for about 160 bright stars (each one can be switched off).
- Sun, Moon (a lit sphere, so the phase and its orientation come out right) and the planets Mercury to Neptune.
- Sky colour from the Sun's altitude: night, twilight glow towards the Sun, and daylight. Fewer stars show as the sky gets brighter.
- Time controls: now, pause, run forwards or backwards at up to 1 day per second, and a date and time picker.
- Location: geolocation (rounded to about 1 km and never stored), manual latitude and longitude, and a few presets (Greenwich Observatory is the default).
- Click any star or planet to see its name, magnitude, RA/Dec (J2000 and of date), altitude and azimuth. You can centre it or track it.
- **Telescope view.** Choose among real models (binoculars, achromatic and apochromatic refractors, Dobsonians, Maksutovs and Schmidt-Cassegrains) or set your own aperture, focal length and design with sliders, then an eyepiece (4 to 32 mm) and a ×2 or ×3 Barlow. Every change updates the eyepiece view at once, with live gauges for magnification (and its useful range), true field, exit pupil, faintest stars and resolution, plus a line on what the combination is good for. The view also reproduces the optics: diffraction spikes on a Newtonian, the violet halo of a short achromat, dimmer nebulae at high power, softer images past the useful magnification, and optionally the rotated (Newtonian) or mirrored (star diagonal) image. A warning appears if the Sun is near the field.
- **Search.** Type a name or number (Jupiter, Vega, M31, NGC 5139, Omega…) or press `/`. Results say when something is below the horizon.
- **Telescope targets.** Switching to the telescope view always aims at something: the selected object if it is up, otherwise Vega at night or the brightest visible object in daylight, and the view then tracks it. A selector in the bottom bar (or the `[` and `]` keys) steps through the targets that are currently above the horizon, away from the Sun and bright enough to see: the Moon, the planets, about 25 classic eyepiece stars such as Albireo and Mizar, and the best-known deep-sky objects (at night). Clicking an object inside the eyepiece re-aims the telescope at it.
- Shareable views through the query string, for example
  `?t=2026-10-04T02:30:00Z&target=m42&scope=1&model=skyliner-200p&eye=25`
  (`t`, `lat`, `lon`, `az`, `alt`, `fov`, `scope`, `model`, `eye`, `barlow`, `sky`, `target`, `paused`, `panel`, `milkyway`, `deepsky`).
- The chosen equipment and sky darkness are remembered in the browser.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173/planetarium/
npm test           # astronomy unit tests (Vitest)
npm run build      # type-check and production build into dist/
npm run data       # optional: regenerate public/data/ from the source catalogues
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/pages.yml`. Set **Settings → Pages → Source** to "GitHub Actions". The site is built with the base path `/planetarium/`.

## How it works

All the astronomy is in `src/astro/` as small, framework-free functions. The tests in `tests/astro.test.ts` check them against worked examples from Jean Meeus, *Astronomical Algorithms*.

- **Julian date.** Unix milliseconds / 86400000 + 2440587.5. TT is taken as UT + 69 s, which is close enough for the Moon.
- **Sidereal time.** Greenwich mean sidereal time from Meeus eq. 12.4. Local sidereal time adds the east longitude. It matches Meeus 12.a and 12.b to 0.001 s.
- **Precession.** IAU 1976 angles ζ, z and θ (Meeus 21.2), applied as a 3×3 rotation from J2000 to the mean equinox of date. It reproduces Meeus 21.b (θ Persei, 2028) to 0.01″. Nutation and aberration (both under 1′) are ignored.
- **RA/Dec to Alt/Az.** The hour angle is H = LST − RA, which gives sin(alt) = sin φ sin δ + cos φ cos δ cos H. The renderer does the same thing as one matrix: `[east; zenith; south] · Rz(−LST) · precession`. Applied to the star group in three.js, it turns the whole sky in a single transform. A test checks that the matrix path and the spherical trigonometry agree, and that Venus in Meeus 13.b comes out within 0.001°. The small difference is because Meeus uses apparent sidereal time.
- **Planets.** Keplerian elements and their rates from JPL ("Approximate Positions of the Planets", valid 1800–2050). The code solves Kepler's equation, rotates the orbit into J2000 ecliptic coordinates, subtracts the Earth, corrects once for light time and rotates by the obliquity. Venus is within about 2″ of Meeus 33.a. Magnitudes use the phase-angle formulas in Meeus ch. 41, with Saturn's rings ignored.
- **Sun.** This is the Earth's orbit from the same table, seen the other way round. It is within 5″ of Meeus 25.a.
- **Moon.** The 24 largest longitude and distance terms and the 13 largest latitude terms of Meeus ch. 47. These match example 47.a to 0.002° and 41 km. Topocentric parallax (up to 1°) is applied by subtracting the observer's position. The phase comes from lighting a sphere with a directional light placed at the Sun.
- **Star brightness.** The relative flux against the current limiting magnitude is 10^(0.4·(m_lim − m)). Point size grows with flux^0.27, and stars near the limit fade instead of shrinking. Colour goes from B−V to temperature (Ballesteros 2012) to an RGB blackbody fit, then is softened towards white.
- **Sky brightness.** The naked-eye limiting magnitude goes from 6.5 when the Sun is below −18° to about −3 in full daylight, interpolated piecewise between those points. The sky dome shader mixes night, twilight and day gradients from the Sun's altitude.
- **Telescope maths.** These are the usual rules of thumb:
  - magnification M = F_telescope / F_eyepiece
  - true field = AFOV / M
  - exit pupil = D / M
  - maximum useful magnification ≈ 2 × D(mm)
  - minimum useful magnification = D / 7 mm
  - limiting magnitude ≈ 2.7 + 5·log₁₀ D(mm), so ≈ 11.9 for 70 mm
  - Dawes limit = 116″ / D(mm)

  The camera's field of view is set so that the true field fills the eyepiece circle, which takes the free space between the header and the controls. The telescope gains the same number of magnitudes over the eye whatever the sky brightness.

## Data sources and licences

| Data | Source | Licence |
| --- | --- | --- |
| Stars (`public/data/stars.json`) | Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), CDS [V/50](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50) | Public domain |
| Star names | IAU Working Group on Star Names (mapping written by hand in `scripts/star-names.mjs`) | Facts, no licence needed |
| Constellation lines and label positions (`public/data/constellations.json`) | [d3-celestial](https://github.com/ofrohn/d3-celestial) by Olaf Frohn, based on the IAU charts | BSD 3-Clause, notice in `public/data/NOTICE.txt` |
| Deep-sky objects (`public/data/dso.json`) | [OpenNGC](https://github.com/mattiaverga/OpenNGC) by Mattia Verga, release v20260501 | CC BY-SA 4.0 (the derived file is shared under the same license) |
| Milky Way (`public/textures/milkyway.jpg`) | NASA/Goddard Space Flight Center Scientific Visualization Studio, [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851/), diffuse light map, tone-mapped | Public domain (NASA) |
| Moon colour and relief (`moon.jpg`, `moon-normal.jpg`) | NASA SVS [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) (LRO LROC colour and LOLA elevation; the normal map is computed from the elevation) | Public domain (NASA) |
| Planet maps and Saturn's rings (`public/textures/*.jpg`, `saturn-ring.png`) | [Solar System Scope](https://www.solarsystemscope.com/textures/), based on NASA mission data | CC BY 4.0 |
| Planet poles and rotation | IAU WGCCRE 2015 report (Archinal et al. 2018) | Facts |
| Galilean moons | J. Meeus, *Astronomical Algorithms*, ch. 44 | Formulas, reimplemented |
| Interface font | [Inter](https://rsms.me/inter/) by Rasmus Andersson, via @fontsource-variable/inter | SIL Open Font License 1.1 |
| Planet orbital elements | E. M. Standish, JPL Solar System Dynamics | Public domain (US Government) |
| Algorithms | J. Meeus, *Astronomical Algorithms*, 2nd ed. | Formulas, reimplemented |

The code is MIT licensed (see `LICENSE`).

## Limitations

- The Bright Star Catalogue is complete only to magnitude 6.5. The telescope view reports a limit of about 11.9, but it cannot show stars fainter than the catalogue (clusters and the Milky Way fill in some of the faint background).
- Deep-sky objects are drawn procedurally from their catalogue size, brightness and type, not from photographs: they are an impression of the eyepiece view, not a chart.
- Specifications of the commercial telescopes are the makers' published values; real instruments vary.
- No refraction, nutation, aberration or stellar proper motion, so positions can be off by up to about 1′. That is fine for a visual planetarium but not for pointing a mount.
- The planet elements are only valid from 1800 to 2050. The planets drift outside that range.
- Times are shown in your browser's time zone and in UTC, not in the observer's local time zone.

## Project structure

```
src/
  astro/        time, coordinates, precession, Sun/Moon/planets, planet orientation, Jupiter's moons, optics (pure TS, unit tested)
  sky/          three.js scene, star and sky shaders, Milky Way, deep-sky objects, textured bodies, 2D labels and eyepiece overlay
  ui/           formatting helpers, equipment panel, search
  data.ts       loads public/data/*.json
  equipment.ts  telescope, eyepiece and Barlow catalogue
  state.ts      app state, presets, query-string options
  targets.ts    telescope tour: showpiece targets, visibility and default choice
  main.ts       wiring: input, controls, info card, render loop
public/data/    preprocessed catalogues + NOTICE.txt
public/textures/ Milky Way, Moon and planet maps + NOTICE.txt
scripts/        build-data.mjs (downloads and converts the catalogues), star-names.mjs
tests/          Vitest tests against Meeus reference values, telescope target choice
docs/           screenshots
```
