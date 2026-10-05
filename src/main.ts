import './style.css';
import { loadCatalogues } from './data';
import { Sky, type Target } from './sky/sky';
import { Overlay } from './sky/overlay';
import { EYEPIECE_PRESETS, PLACES, SPEEDS, type AppState, applyQuery, defaultState } from './state';
import { horizonVecToAltAz, precessRaDec } from './astro/coords';
import { vecToSpherical, norm360 } from './astro/math';
import { PLANETS, moonPhaseName } from './astro/solarsystem';
import { telescopeStats } from './astro/optics';
import { compass, formatDMS, formatDeg, formatRA, toLocalInput } from './ui/format';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

async function main() {
  const state: AppState = applyQuery(defaultState(), location.search);
  const { stars, constellations } = await loadCatalogues();
  const glCanvas = $<HTMLCanvasElement>('gl');
  const sky = new Sky(glCanvas, stars, constellations);
  const overlay = new Overlay($<HTMLCanvasElement>('overlay'));
  $('loading').remove();

  let width = 0, height = 0;
  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    sky.resize(width, height);
    overlay.resize(width, height);
  };
  window.addEventListener('resize', resize);
  resize();

  let selection: Target | null = null;
  let tracking = false;

  // ---------------------------------------------------------------- view input
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number } | null = null;
  let moved = 0;
  let pinchDist = 0;
  const degPerPixel = () => sky.camera.fov / height;
  const clampAlt = (a: number) => Math.max(-30, Math.min(89.9, a));
  const zoom = (factor: number) => {
    if (state.telescopeMode) return;
    state.fov = Math.max(1, Math.min(120, state.fov * factor));
  };
  const pan = (dx: number, dy: number) => {
    const k = degPerPixel() * (state.telescopeMode && state.invertImage ? -1 : 1);
    state.az = norm360(state.az - dx * k);
    state.alt = clampAlt(state.alt + dy * k);
    tracking = false;
    $<HTMLInputElement>('info-track').checked = false;
  };

  glCanvas.addEventListener('pointerdown', (e) => {
    glCanvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downAt = { x: e.clientX, y: e.clientY };
      moved = 0;
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  glCanvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      pan(cur.x - prev.x, cur.y - prev.y);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) zoom(pinchDist / d);
      pinchDist = d;
      moved = Infinity;
    }
  });
  const pointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && downAt && moved < 6) {
      selection = sky.pick(e.clientX, e.clientY, width, height, state.showGround);
      tracking = false;
      $<HTMLInputElement>('info-track').checked = false;
      updateInfo(true);
    }
    if (pointers.size === 0) downAt = null;
  };
  glCanvas.addEventListener('pointerup', pointerUp);
  glCanvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
  glCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(Math.exp(e.deltaY * 0.0015));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, select')) return;
    const step = 40;
    if (e.key === 'ArrowLeft') pan(step, 0);
    else if (e.key === 'ArrowRight') pan(-step, 0);
    else if (e.key === 'ArrowUp') pan(0, step);
    else if (e.key === 'ArrowDown') pan(0, -step);
    else if (e.key === '+' || e.key === '=') zoom(1 / 1.25);
    else if (e.key === '-') zoom(1.25);
    else if (e.key === ' ') { state.playing = !state.playing; syncControls(); }
    else if (e.key.toLowerCase() === 't') setTelescope(!state.telescopeMode);
    else return;
    e.preventDefault();
  });

  // ---------------------------------------------------------------- controls
  const panel = $('panel');
  if (window.innerWidth < 640 || new URLSearchParams(location.search).get('panel') === '0') panel.classList.add('collapsed');
  $('panel-toggle').addEventListener('click', () => panel.classList.toggle('collapsed'));

  const speedSelect = $<HTMLSelectElement>('speed');
  SPEEDS.forEach((s, i) => speedSelect.add(new Option(s.label, String(i))));
  speedSelect.addEventListener('change', () => { state.speedIndex = Number(speedSelect.value); state.playing = true; syncControls(); });
  $('slower').addEventListener('click', () => { state.speedIndex = Math.max(0, state.speedIndex - 1); state.playing = true; syncControls(); });
  $('faster').addEventListener('click', () => { state.speedIndex = Math.min(SPEEDS.length - 1, state.speedIndex + 1); state.playing = true; syncControls(); });
  $('play').addEventListener('click', () => { state.playing = !state.playing; syncControls(); });
  $('now').addEventListener('click', () => { state.time = Date.now(); state.speedIndex = 4; state.playing = true; syncControls(); });

  const dt = $<HTMLInputElement>('datetime');
  dt.addEventListener('change', () => {
    const t = new Date(dt.value).getTime();
    if (!Number.isNaN(t)) state.time = t;
  });

  const placeSelect = $<HTMLSelectElement>('place');
  PLACES.forEach((p, i) => placeSelect.add(new Option(p.name, String(i))));
  placeSelect.add(new Option('Custom', 'custom'));
  placeSelect.addEventListener('change', () => {
    const p = PLACES[Number(placeSelect.value)];
    if (!p) return;
    Object.assign(state, { lat: p.lat, lon: p.lon, placeName: p.name });
    syncControls();
  });
  const latInput = $<HTMLInputElement>('lat'), lonInput = $<HTMLInputElement>('lon');
  for (const input of [latInput, lonInput])
    input.addEventListener('change', () => {
      const lat = Number(latInput.value), lon = Number(lonInput.value);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        Object.assign(state, { lat, lon, placeName: 'Custom' });
      }
      syncControls();
    });
  $('geolocate').addEventListener('click', () => {
    const status = $('geo-status');
    if (!navigator.geolocation) { status.textContent = 'Geolocation is not available.'; return; }
    status.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded to ~1 km: plenty for the sky, and nothing more precise is kept.
        state.lat = Math.round(pos.coords.latitude * 100) / 100;
        state.lon = Math.round(pos.coords.longitude * 100) / 100;
        state.placeName = 'My location';
        status.textContent = '';
        syncControls();
      },
      (err) => { status.textContent = `Could not get your location (${err.message}).`; },
      { timeout: 10000 },
    );
  });

  const checks: [string, keyof AppState][] = [
    ['show-lines', 'showLines'], ['show-cnames', 'showConstellationNames'], ['show-snames', 'showStarNames'],
    ['show-atmosphere', 'showAtmosphere'], ['show-ground', 'showGround'], ['invert', 'invertImage'],
  ];
  for (const [id, key] of checks) {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('change', () => { (state[key] as boolean) = el.checked; });
  }

  const setTelescope = (on: boolean) => {
    state.telescopeMode = on;
    // Point the telescope at the selected object, like a finder scope would.
    if (on && selection) centerOn(selection);
    syncControls();
  };
  $<HTMLInputElement>('scope').addEventListener('change', (e) => setTelescope((e.target as HTMLInputElement).checked));
  $('scope-toggle').addEventListener('click', () => setTelescope(!state.telescopeMode));
  const scopeInputs: [string, keyof AppState['telescope']][] = [
    ['tel-f', 'focalLength'], ['tel-d', 'aperture'], ['eye-f', 'eyepieceFocalLength'], ['eye-afov', 'apparentFov'],
  ];
  for (const [id, key] of scopeInputs) {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('change', () => {
      const v = Number(el.value);
      if (Number.isFinite(v) && v > 0) state.telescope[key] = v;
      syncControls();
    });
  }
  const eyepieces = $('eyepieces');
  for (const mm of EYEPIECE_PRESETS) {
    const b = document.createElement('button');
    b.textContent = `${mm} mm`;
    b.dataset.mm = String(mm);
    b.addEventListener('click', () => { state.telescope.eyepieceFocalLength = mm; syncControls(); });
    eyepieces.append(b);
  }

  function syncControls() {
    speedSelect.value = String(state.speedIndex);
    $('speed-label').textContent = state.playing ? SPEEDS[state.speedIndex].label : 'Paused';
    $('play').textContent = state.playing ? '⏸' : '▶';
    latInput.value = state.lat.toFixed(4);
    lonInput.value = state.lon.toFixed(4);
    const idx = PLACES.findIndex((p) => p.lat === state.lat && p.lon === state.lon);
    placeSelect.value = idx >= 0 ? String(idx) : 'custom';
    for (const [id, key] of checks) $<HTMLInputElement>(id).checked = state[key] as boolean;
    $<HTMLInputElement>('scope').checked = state.telescopeMode;
    $('scope-toggle').classList.toggle('active', state.telescopeMode);
    for (const [id, key] of scopeInputs) $<HTMLInputElement>(id).value = String(state.telescope[key]);
    for (const b of eyepieces.querySelectorAll<HTMLButtonElement>('button'))
      b.classList.toggle('active', Number(b.dataset.mm) === state.telescope.eyepieceFocalLength);
    renderScopeStats();
  }

  function renderScopeStats() {
    const s = telescopeStats(state.telescope);
    const tooHigh = s.magnification > s.maxUsefulMagnification;
    const rows: [string, string, boolean?][] = [
      ['Magnification', `${s.magnification.toFixed(0)}×`, tooHigh],
      ['True field of view', `${s.trueFov.toFixed(2)}° (${(s.trueFov * 60).toFixed(0)}′)`],
      ['Exit pupil', `${s.exitPupil.toFixed(1)} mm`],
      ['Focal ratio', `f/${s.focalRatio.toFixed(1)}`],
      ['Limiting magnitude', `≈ ${s.limitingMagnitude.toFixed(1)}`],
      ['Useful magnification', `${Math.ceil(s.minUsefulMagnification)}× – ${s.maxUsefulMagnification.toFixed(0)}×`],
      ['Resolution (Dawes)', `${s.dawesLimitArcsec.toFixed(1)}″`],
      ['Light grasp vs eye', `${s.lightGrasp.toFixed(0)}×`],
    ];
    $('scope-stats').innerHTML = rows
      .map(([k, v, warn]) => `<tr><td>${k}</td><td${warn ? ' class="warn" title="Above the useful maximum"' : ''}>${v}</td></tr>`)
      .join('');
  }

  // ---------------------------------------------------------------- info card
  const info = $('info');
  $('info-close').addEventListener('click', () => { selection = null; tracking = false; updateInfo(true); });
  $('info-center').addEventListener('click', () => selection && centerOn(selection));
  $<HTMLInputElement>('info-track').addEventListener('change', (e) => {
    tracking = (e.target as HTMLInputElement).checked;
    if (tracking && selection) centerOn(selection);
  });

  function centerOn(t: Target) {
    const { alt, az } = horizonVecToAltAz(sky.targetVec(t));
    state.alt = clampAlt(alt);
    state.az = az;
  }

  let lastInfo = 0;
  function updateInfo(force = false) {
    const now = performance.now();
    if (!force && now - lastInfo < 250) return;
    lastInfo = now;
    info.hidden = !selection;
    if (!selection) return;
    const f = sky.frame;
    const v = sky.targetVec(selection);
    const { alt, az } = horizonVecToAltAz(v);
    let title = '', sub = '', raJ = 0, decJ = 0;
    const extra: [string, string][] = [];
    if (selection.kind === 'star') {
      const s = stars[selection.index];
      title = s.name || s.designation || `HR ${s.hr}`;
      sub = ['Star', s.name ? s.designation : '', `HR ${s.hr}`].filter(Boolean).join(' · ');
      [raJ, decJ] = [s.ra, s.dec];
      extra.push(['Magnitude', s.mag.toFixed(2)], ['Colour index B−V', s.bv.toFixed(2)]);
    } else {
      const body = selection.kind === 'planet' ? f.planets.get(selection.id)! : selection.kind === 'sun' ? f.sun : f.moon;
      [raJ, decJ] = vecToSpherical(body.dirJ2000);
      if (selection.kind === 'planet') {
        const id = selection.id;
        title = PLANETS.find((p) => p.id === id)!.name;
        sub = 'Planet';
        extra.push(['Magnitude', body.mag.toFixed(1)], ['Distance', `${body.distanceAu.toFixed(3)} au`],
          ['Illuminated', `${(body.illuminated * 100).toFixed(0)} %`]);
      } else if (selection.kind === 'sun') {
        title = 'Sun';
        sub = 'Star · never look at it through a telescope without a proper solar filter';
        extra.push(['Magnitude', body.mag.toFixed(1)], ['Distance', `${body.distanceAu.toFixed(4)} au`]);
      } else {
        title = 'Moon';
        const [raSun] = vecToSpherical(f.sun.dirJ2000);
        const waxing = norm360(raJ - raSun) < 180;
        sub = moonPhaseName(body.illuminated, waxing);
        extra.push(['Magnitude', body.mag.toFixed(1)], ['Illuminated', `${(body.illuminated * 100).toFixed(0)} %`],
          ['Distance', `${Math.round(body.distanceAu * 149597870.7).toLocaleString('en')} km`]);
      }
    }
    const [raD, decD] = precessRaDec(raJ, decJ, f.jdTT);
    const rows: [string, string][] = [
      ...extra,
      ['RA / Dec (J2000)', `${formatRA(raJ)} ${formatDMS(decJ)}`],
      ['RA / Dec (of date)', `${formatRA(raD)} ${formatDMS(decD)}`],
      ['Altitude', `${formatDeg(alt)}${alt < 0 ? ' (below horizon)' : ''}`],
      ['Azimuth', `${formatDeg(az)} ${compass(az)}`],
    ];
    $('info-title').textContent = title;
    $('info-sub').textContent = sub;
    $('info-table').innerHTML = rows.map(([k, val]) => `<tr><td>${k}</td><td>${val}</td></tr>`).join('');
  }

  // Optional ?target=moon|jupiter|sirius|... selects, centres and tracks an object.
  const targetName = new URLSearchParams(location.search).get('target')?.toLowerCase();
  if (targetName) {
    const planet = PLANETS.find((p) => p.id === targetName);
    const starIndex = stars.findIndex((s) => s.name.toLowerCase() === targetName);
    selection = targetName === 'sun' || targetName === 'moon' ? { kind: targetName }
      : planet ? { kind: 'planet', id: planet.id }
      : starIndex >= 0 ? { kind: 'star', index: starIndex } : null;
    if (selection) {
      sky.update(state, width, height);
      centerOn(selection);
      tracking = true;
      $<HTMLInputElement>('info-track').checked = true;
      updateInfo(true);
    }
  }

  // ---------------------------------------------------------------- loop
  const clock = $('clock');
  let lastFrame = performance.now();
  let lastClock = -Infinity;
  syncControls();

  function frame(now: number) {
    const dtSec = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state.playing) state.time += dtSec * 1000 * SPEEDS[state.speedIndex].rate;

    if (tracking && selection) {
      sky.update(state, width, height);
      centerOn(selection);
    }
    const f = sky.update(state, width, height);
    sky.render();
    overlay.draw(sky, state, selection, width, height);
    updateInfo();

    if (now - lastClock > 200) {
      lastClock = now;
      const d = new Date(state.time);
      const lat = `${Math.abs(state.lat).toFixed(2)}°${state.lat >= 0 ? 'N' : 'S'}`;
      const lon = `${Math.abs(state.lon).toFixed(2)}°${state.lon >= 0 ? 'E' : 'W'}`;
      clock.textContent =
        `${d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })} (browser time)\n` +
        `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC · LST ${formatRA(f.lst).slice(0, 7)}\n` +
        `${state.placeName} ${lat} ${lon} · Sun ${formatDeg(f.sunAlt)}`;
      if (document.activeElement !== dt) dt.value = toLocalInput(state.time);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Could not start: ${err instanceof Error ? err.message : String(err)}`;
});
