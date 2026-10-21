import '@fontsource-variable/inter';
import './style.css';
import { loadCatalogues } from './data';
import { Sky, type Target } from './sky/sky';
import { Overlay } from './sky/overlay';
import { PLACES, SKY_QUALITY, SPEEDS, type AppState, applyQuery, defaultState, syncTelescope } from './state';
import { horizonVecToAltAz, j2000ToHorizonMatrix, precessRaDec } from './astro/coords';
import { vecToSpherical, norm360, mulMatVec } from './astro/math';
import { PLANETS, moonPhase, sunPosition } from './astro/solarsystem';
import { julianDate, lstDeg, ttFromUt } from './astro/time';
import { telescopeStats } from './astro/optics';
import { compass, formatDMS, formatRA, toLocalInput } from './ui/format';
import { buildTour, defaultStop, stopMagnitude, targetKey, visibleStops, type TourStop } from './targets';
import { bodyName, dsoLabel, starLabel, targetLabel as nameOf } from './names';
import { LANGS, type Lang, type MsgKey, applyStatic, lang, langName, locale, localCompass, num, onLangChange, setLang, t, tx } from './i18n';
import { Guide } from './ui/guide';
import { BARLOWS, findTelescope, EYEPIECES, type Equipment } from './equipment';
import { GearPanel } from './ui/gear';
import { buildSearchIndex, setupSearch, type Highlight } from './ui/search';
import { MobileShell, PHONE } from './ui/mobile';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function sunAltAt(time: number, lat: number, lon: number): number {
  const jdUT = julianDate(new Date(time));
  const jdTT = ttFromUt(jdUT);
  const m = j2000ToHorizonMatrix(jdTT, lat, lstDeg(jdUT, lon));
  return horizonVecToAltAz(mulMatVec(m, sunPosition(jdTT).dirJ2000)).alt;
}

/** First moment after `time` when the Sun is well below the horizon (dark sky), within two days. */
function nextDark(time: number, lat: number, lon: number): number | null {
  const step = 10 * 60 * 1000;
  for (let t = time; t < time + 48 * 3600 * 1000; t += step) {
    if (sunAltAt(t, lat, lon) < -15) return t + 30 * 60 * 1000;
  }
  return null; // midnight sun or polar day
}

// The equipment and sky darkness are remembered between visits (unless the URL sets them).
const STORAGE_KEY = 'planetarium.equipment';
function loadSaved(state: AppState, search: string): void {
  const q = new URLSearchParams(search);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { equipment?: Equipment; skyQuality?: number; realOrientation?: boolean } | null;
    if (!saved) return;
    const e = saved.equipment;
    if (e && !q.has('model') && !q.has('eye') && !q.has('barlow')) {
      if (findTelescope(e.telescopeId) || e.telescopeId === 'custom') state.equipment.telescopeId = e.telescopeId;
      if (EYEPIECES.some((x) => x.id === e.eyepieceId)) state.equipment.eyepieceId = e.eyepieceId;
      if ((BARLOWS as readonly number[]).includes(e.barlow)) state.equipment.barlow = e.barlow;
      if (e.custom) Object.assign(state.equipment.custom, e.custom);
    }
    if (!q.has('sky') && typeof saved.skyQuality === 'number' && SKY_QUALITY[saved.skyQuality]) state.skyQuality = saved.skyQuality;
    if (typeof saved.realOrientation === 'boolean') state.realOrientation = saved.realOrientation;
  } catch {
    // Storage unavailable or corrupt: keep the defaults.
  }
  syncTelescope(state);
}
function save(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ equipment: state.equipment, skyQuality: state.skyQuality, realOrientation: state.realOrientation }));
  } catch {
    // Private mode or blocked storage: nothing to do.
  }
}

applyStatic();

async function main() {
  const state: AppState = defaultState();
  loadSaved(state, location.search);
  applyQuery(state, location.search);
  const { stars, constellations, dso } = await loadCatalogues();
  const glCanvas = $<HTMLCanvasElement>('gl');
  const sky = new Sky(glCanvas, stars, constellations, dso);
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

  // Keep the cards above the time bar and the equipment panel, whose heights change.
  const watchHeight = (el: HTMLElement, name: string) =>
    new ResizeObserver(() => document.documentElement.style.setProperty(name, `${el.offsetHeight}px`)).observe(el);
  watchHeight(document.querySelector<HTMLElement>('.timebar')!, '--timebar-h');
  watchHeight($('gear'), '--gear-h');

  let selection: Target | null = null;
  let tracking = false;
  const tour = buildTour(stars, dso);
  let visible: TourStop[] = [];

  // ---------------------------------------------------------------- view input
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number } | null = null;
  let moved = 0;
  let pinchDist = 0;
  const degPerPixel = () => sky.camera.fov / height;
  const clampAlt = (a: number) => Math.max(-30, Math.min(89.9, a));
  const zoom = (factor: number) => {
    if (state.telescopeMode) return;
    state.fov = Math.max(0.5, Math.min(120, state.fov * factor));
  };
  const pan = (dx: number, dy: number) => {
    // Drag the sky along with the pointer, whichever way the eyepiece turns the image.
    const o = sky.frame?.orientation ?? 'normal';
    const k = degPerPixel();
    state.az = norm360(state.az - dx * k * (o === 'normal' ? 1 : -1));
    state.alt = clampAlt(state.alt + dy * k * (o === 'rotated' ? -1 : 1));
    tracking = false;
    $<HTMLInputElement>('info-track').checked = false;
    mobile?.stopGyro();
  };
  // Set up further down; the view handlers only use it once the page is running.
  let mobile: MobileShell | undefined;

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
      // A fingertip is less precise than a mouse pointer.
      const picked = sky.pick(e.clientX, e.clientY, width, height, state.showGround, e.pointerType === 'touch' ? 28 : 14, state.showDeepSky);
      if (state.telescopeMode) {
        // In the eyepiece a click re-aims the telescope; a click on empty sky keeps the current target.
        if (picked) aimAt(picked);
      } else {
        selection = picked;
        tracking = false;
        $<HTMLInputElement>('info-track').checked = false;
        updateInfo(true);
      }
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
    else if (e.key === ']' && state.telescopeMode) stepTarget(1);
    else if (e.key === '[' && state.telescopeMode) stepTarget(-1);
    else return;
    e.preventDefault();
  });

  // ---------------------------------------------------------------- controls
  const panel = $('panel');
  const panelParam = new URLSearchParams(location.search).get('panel');
  if (panelParam === '0' || (window.innerWidth < 640 && panelParam !== '1')) panel.classList.add('collapsed');
  $('panel-toggle').addEventListener('click', () => panel.classList.toggle('collapsed'));
  $('panel-close').addEventListener('click', () => { if (!PHONE.matches) panel.classList.add('collapsed'); });

  const dayHint = $('day-hint');
  $('tonight').addEventListener('click', () => {
    const t = nextDark(state.time, state.lat, state.lon);
    if (t === null) return;
    state.time = t;
    state.speedIndex = 4;
    state.playing = true;
    syncControls();
  });

  const speedSelect = $<HTMLSelectElement>('speed');
  SPEEDS.forEach((_, i) => speedSelect.add(new Option(speedLabel(i), String(i))));
  speedSelect.addEventListener('change', () => { state.speedIndex = Number(speedSelect.value); state.playing = true; syncControls(); });
  $('slower').addEventListener('click', () => { state.speedIndex = Math.max(0, state.speedIndex - 1); state.playing = true; syncControls(); });
  $('faster').addEventListener('click', () => { state.speedIndex = Math.min(SPEEDS.length - 1, state.speedIndex + 1); state.playing = true; syncControls(); });
  $('play').addEventListener('click', () => { state.playing = !state.playing; syncControls(); });
  $('now').addEventListener('click', () => { state.time = Date.now(); state.speedIndex = 4; state.playing = true; syncControls(); });

  function speedLabel(i: number): string {
    return t(`speed.${i}` as MsgKey);
  }

  const dt = $<HTMLInputElement>('datetime');
  dt.addEventListener('change', () => {
    const t = new Date(dt.value).getTime();
    if (!Number.isNaN(t)) state.time = t;
  });

  const placeSelect = $<HTMLSelectElement>('place');
  /** Name of the current place in the current language. */
  function placeLabel(): string {
    if (state.placeId === 'approx') return t('place.approx', { city: state.placeCity });
    return tx(`place.${state.placeId}`, t('place.custom'));
  }
  function fillPlaces() {
    const options = PLACES.map((p) => new Option(t(`place.${p.id}` as MsgKey), p.id));
    if (state.placeId === 'approx') options.unshift(new Option(placeLabel(), 'approx'));
    if (state.placeId === 'mine') options.unshift(new Option(t('place.mine'), 'mine'));
    options.push(new Option(t('place.custom'), 'custom'));
    placeSelect.replaceChildren(...options);
    placeSelect.value = state.placeId;
  }
  placeSelect.addEventListener('change', () => {
    const p = PLACES.find((x) => x.id === placeSelect.value);
    if (!p) return;
    Object.assign(state, { lat: p.lat, lon: p.lon, placeId: p.id });
    syncControls();
  });
  const latInput = $<HTMLInputElement>('lat'), lonInput = $<HTMLInputElement>('lon');
  for (const input of [latInput, lonInput])
    input.addEventListener('change', () => {
      const lat = Number(latInput.value), lon = Number(lonInput.value);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        Object.assign(state, { lat, lon, placeId: 'custom' });
      }
      syncControls();
    });
  $('geolocate').addEventListener('click', () => {
    const status = $('geo-status');
    if (!navigator.geolocation) { status.textContent = t('set.noGeo'); return; }
    status.textContent = t('set.locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded to ~1 km: plenty for the sky, and nothing more precise is kept.
        state.lat = Math.round(pos.coords.latitude * 100) / 100;
        state.lon = Math.round(pos.coords.longitude * 100) / 100;
        state.placeId = 'mine';
        status.textContent = '';
        syncControls();
      },
      (err) => { status.textContent = t('set.geoError', { error: err.message }); },
      { timeout: 10000 },
    );
  });

  const skyQuality = $<HTMLSelectElement>('sky-quality');
  SKY_QUALITY.forEach((_, i) => skyQuality.add(new Option(t(`sky.${i}` as MsgKey), String(i))));
  skyQuality.addEventListener('change', () => { state.skyQuality = Number(skyQuality.value); save(state); });

  const checks: [string, keyof AppState][] = [
    ['show-milkyway', 'showMilkyWay'], ['show-deepsky', 'showDeepSky'],
    ['show-lines', 'showLines'], ['show-cnames', 'showConstellationNames'], ['show-snames', 'showStarNames'],
    ['show-atmosphere', 'showAtmosphere'], ['show-ground', 'showGround'], ['real-orientation', 'realOrientation'],
  ];
  for (const [id, key] of checks) {
    const el = $<HTMLInputElement>(id);
    el.addEventListener('change', () => { (state[key] as boolean) = el.checked; save(state); });
  }

  // ---------------------------------------------------------------- equipment
  const gear = new GearPanel(state, () => save(state));
  // On phones the panel starts folded so the eyepiece stays visible.
  if (window.innerWidth < 640) { $('gear').classList.add('collapsed'); $('gear-toggle').setAttribute('aria-expanded', 'false'); }
  else document.body.classList.add('gear-open');

  // ---------------------------------------------------------------- telescope targets
  const scopeSelect = $<HTMLSelectElement>('scope-target');
  let optionsSignature = '';

  const targetLabel = (target: Target) => nameOf(target, stars, dso);

  /** Recomputes which tour stops are up and refreshes the target selector. */
  function refreshStops(updateFrame = true) {
    if (updateFrame) sky.update(state, width, height);
    visible = visibleStops(tour, sky, stars);
    const current = selection ? targetKey(selection) : '';
    const entries = visible.map((s) => ({ key: s.key, name: targetLabel(s.target) }));
    // An object picked by clicking that is not in the tour still shows as the current target.
    if (selection && current && !entries.some((e) => e.key === current)) entries.unshift({ key: current, name: targetLabel(selection) });
    const signature = `${lang()}|${entries.map((e) => e.key).join('|')}`;
    if (signature !== optionsSignature) {
      optionsSignature = signature;
      scopeSelect.replaceChildren(...entries.map((e) => new Option(e.name, e.key)));
      if (!entries.length) scopeSelect.add(new Option(t('scope.nothing'), ''));
    }
    scopeSelect.disabled = entries.length === 0;
    if (entries.some((e) => e.key === current)) scopeSelect.value = current;
    else scopeSelect.selectedIndex = entries.length ? -1 : 0;
  }

  /** Selects a target, points the telescope at it and keeps tracking it. */
  function aimAt(t: Target) {
    selection = t;
    tracking = true;
    $<HTMLInputElement>('info-track').checked = true;
    sky.update(state, width, height);
    centerOn(t);
    updateInfo(true);
    refreshStops();
  }

  function stepTarget(dir: 1 | -1) {
    refreshStops();
    if (!visible.length) return;
    const i = selection ? visible.findIndex((s) => s.key === targetKey(selection!)) : -1;
    const next = i < 0 ? (dir > 0 ? 0 : visible.length - 1) : (i + dir + visible.length) % visible.length;
    aimAt(visible[next].target);
  }

  scopeSelect.addEventListener('change', () => {
    const stop = tour.find((s) => s.key === scopeSelect.value);
    if (stop) aimAt(stop.target);
    scopeSelect.blur();
  });
  $('scope-prev').addEventListener('click', () => stepTarget(-1));
  $('scope-next').addEventListener('click', () => stepTarget(1));

  // The equipment panel and the info card take the sides in the telescope view: the settings step aside.
  let panelWasOpen = false;
  const setTelescope = (on: boolean) => {
    if (on === state.telescopeMode && on) return;
    state.telescopeMode = on;
    if (on) {
      panelWasOpen = !panel.classList.contains('collapsed');
      panel.classList.add('collapsed');
      // Like a finder scope: keep the selected object if it is up, otherwise go to Vega or whatever is visible.
      refreshStops();
      const keep = selection && selection.kind !== 'sun' && horizonVecToAltAz(sky.targetVec(selection)).alt > 0;
      const target = keep ? selection : defaultStop(visible, sky.frame.daylight, (s) => stopMagnitude(s, sky, stars))?.target;
      if (target) aimAt(target);
    } else if (panelWasOpen && !PHONE.matches) {
      panel.classList.remove('collapsed');
    }
    syncControls();
  };
  $<HTMLInputElement>('scope').addEventListener('change', (e) => setTelescope((e.target as HTMLInputElement).checked));
  $('scope-toggle').addEventListener('click', () => setTelescope(!state.telescopeMode));

  function syncControls() {
    speedSelect.value = String(state.speedIndex);
    $('speed-label').textContent = state.playing ? speedLabel(state.speedIndex) : t('time.paused');
    $('play-icon').setAttribute('href', state.playing ? '#i-pause' : '#i-play');
    latInput.value = state.lat.toFixed(4);
    lonInput.value = state.lon.toFixed(4);
    fillPlaces();
    skyQuality.value = String(state.skyQuality);
    for (const [id, key] of checks) $<HTMLInputElement>(id).checked = state[key] as boolean;
    $<HTMLInputElement>('scope').checked = state.telescopeMode;
    $('scope-toggle').classList.toggle('active', state.telescopeMode);
    $('scope-bar').hidden = !state.telescopeMode;
    $('gear').hidden = !state.telescopeMode;
    document.body.classList.toggle('scope-mode', state.telescopeMode);
    gear.sync();
    mobile?.sync();
  }

  // ---------------------------------------------------------------- info card
  const info = $('info');
  $('info-close').addEventListener('click', () => { selection = null; tracking = false; updateInfo(true); });
  $('info-center').addEventListener('click', () => selection && centerOn(selection));
  $('info-scope').addEventListener('click', () => {
    if (!selection) return;
    const t = selection;
    if (!state.telescopeMode) setTelescope(true);
    aimAt(t);
  });
  $<HTMLInputElement>('info-track').addEventListener('change', (e) => {
    tracking = (e.target as HTMLInputElement).checked;
    if (tracking && selection) centerOn(selection);
  });

  function centerOn(t: Target) {
    const { alt, az } = horizonVecToAltAz(sky.targetVec(t));
    state.alt = clampAlt(alt);
    state.az = az;
  }

  const size = (arcmin: number) => (arcmin >= 60 ? `${num(arcmin / 60, 1)}°` : `${num(arcmin, arcmin < 10 ? 1 : 0)}′`);

  let lastInfo = 0;
  function updateInfo(force = false) {
    const now = performance.now();
    if (!force && now - lastInfo < 250) return;
    lastInfo = now;
    info.hidden = !selection;
    document.body.classList.toggle('info-open', !!selection);
    if (!selection) return;
    $('info-scope').hidden = state.telescopeMode || selection.kind === 'sun';
    $('info-more').hidden = !PHONE.matches;
    const f = sky.frame;
    const v = sky.targetVec(selection);
    const { alt, az } = horizonVecToAltAz(v);
    let title = '', sub = '', raJ = 0, decJ = 0;
    const extra: [string, string][] = [];
    if (selection.kind === 'star') {
      const s = stars[selection.index];
      title = starLabel(s);
      sub = [t('info.star'), s.name ? s.designation : '', `HR ${s.hr}`].filter(Boolean).join(' · ');
      [raJ, decJ] = [s.ra, s.dec];
      extra.push([t('info.magnitude'), num(s.mag, 2)], [t('info.colour'), num(s.bv, 2)]);
    } else if (selection.kind === 'dso') {
      const o = dso[selection.index];
      title = dsoLabel(o);
      sub = [t(`kind.${o.kind}` as MsgKey), o.catalogue !== o.id ? o.catalogue : ''].filter(Boolean).join(' · ');
      [raJ, decJ] = [o.ra, o.dec];
      extra.push([t('info.magnitude'), num(o.mag, 1)], [t('info.size'), o.minor && o.minor !== o.major ? `${size(o.major)} × ${size(o.minor)}` : size(o.major)]);
    } else {
      const body = selection.kind === 'planet' ? f.planets.get(selection.id)! : selection.kind === 'sun' ? f.sun : f.moon;
      [raJ, decJ] = vecToSpherical(body.dirJ2000);
      if (selection.kind === 'planet') {
        const id = selection.id;
        title = bodyName(id);
        sub = t('info.planet');
        extra.push([t('info.magnitude'), num(body.mag, 1)], [t('info.apparent'), `${num(f.planetRadius.get(id)! * 7200, 1)}″`],
          [t('info.distance'), `${num(body.distanceAu, 3)} au`], [t('info.lit'), `${num(body.illuminated * 100)} %`]);
      } else if (selection.kind === 'sun') {
        title = bodyName('sun');
        sub = t('info.sunNote');
        extra.push([t('info.magnitude'), num(body.mag, 1)], [t('info.distance'), `${num(body.distanceAu, 4)} au`]);
      } else {
        title = bodyName('moon');
        const [raSun] = vecToSpherical(f.sun.dirJ2000);
        const waxing = norm360(raJ - raSun) < 180;
        sub = t(`phase.${moonPhase(body.illuminated, waxing)}` as MsgKey);
        extra.push([t('info.magnitude'), num(body.mag, 1)], [t('info.lit'), `${num(body.illuminated * 100)} %`],
          [t('info.distance'), `${num(Math.round(body.distanceAu * 149597870.7))} km`]);
      }
    }
    const [raD, decD] = precessRaDec(raJ, decJ, f.jdTT);
    const rows: [string, string][] = [
      ...extra,
      [t('info.radecJ2000'), `${formatRA(raJ)} ${formatDMS(decJ)}`],
      [t('info.radecDate'), `${formatRA(raD)} ${formatDMS(decD)}`],
      [t('info.altitude'), `${num(alt, 1)}°${alt < 0 ? ` ${t('info.below')}` : ''}`],
      [t('info.azimuth'), `${num(az, 1)}° ${localCompass(compass(az))}`],
    ];
    $('info-title').textContent = title;
    $('info-sub').textContent = sub;
    $('info-table').innerHTML = rows.map(([k, val]) => `<tr><td>${k}</td><td>${val}</td></tr>`).join('');
  }

  // ---------------------------------------------------------------- search
  /** What is up right now, for the empty search box: the Moon, planets and showpieces. */
  function highlights(): Highlight[] {
    const all = visibleStops(tour, sky, stars).slice(0, 12);
    return all.map((stop) => {
      const { alt, az } = horizonVecToAltAz(sky.targetVec(stop.target));
      const kind = stop.target.kind === 'planet' ? t('info.planet') : stop.target.kind === 'star' ? t('info.star')
        : stop.target.kind === 'dso' ? t(`kind.${dso[stop.target.index].kind}` as MsgKey) : '';
      const where = t('search.where', { alt: num(alt), dir: localCompass(compass(az)) });
      return { target: stop.target, label: targetLabel(stop.target), sub: kind ? `${kind} · ${where}` : where };
    });
  }

  const searchUi = setupSearch(sky, buildSearchIndex(stars, dso), (target) => {
    if (state.telescopeMode) { aimAt(target); return; }
    selection = target;
    tracking = true;
    $<HTMLInputElement>('info-track').checked = true;
    // Frame the object: big ones fill a good part of the view, small ones get a close look.
    const extent = target.kind === 'dso' ? dso[target.index].major / 60 : target.kind === 'moon' ? 0.5 : 0;
    state.fov = extent ? Math.max(2, Math.min(60, extent * 5)) : target.kind === 'planet' ? 8 : 30;
    sky.update(state, width, height);
    centerOn(target);
    updateInfo(true);
  }, highlights);

  // Optional ?target=moon|jupiter|sirius|m31|ngc 5139|omega centauri selects, centres and tracks an object.
  const targetName = new URLSearchParams(location.search).get('target')?.toLowerCase().trim();
  if (targetName) {
    const planet = PLANETS.find((p) => p.id === targetName);
    const starIndex = stars.findIndex((s) => s.name.toLowerCase() === targetName);
    const squash = (x: string) => x.toLowerCase().replace(/\s+/g, '');
    const dsoIndex = dso.findIndex((o) => squash(o.id) === squash(targetName) || squash(o.catalogue) === squash(targetName) || o.name.toLowerCase() === targetName);
    selection = targetName === 'sun' || targetName === 'moon' ? { kind: targetName }
      : planet ? { kind: 'planet', id: planet.id }
      : starIndex >= 0 ? { kind: 'star', index: starIndex }
      : dsoIndex >= 0 ? { kind: 'dso', index: dsoIndex } : null;
    if (selection) {
      sky.update(state, width, height);
      centerOn(selection);
      tracking = true;
      $<HTMLInputElement>('info-track').checked = true;
      updateInfo(true);
    }
  }

  // ?scope=1 opens straight into the telescope view, aimed at something worth looking at.
  if (state.telescopeMode) { state.telescopeMode = false; setTelescope(true); }

  /** Leaves room for the header and caption above the eyepiece, and for the controls below it. */
  const hud = document.querySelector<HTMLElement>('.hud')!;
  const timebar = document.querySelector<HTMLElement>('.timebar')!;
  function placeEyepiece() {
    const narrow = width < 640;
    const top = hud.getBoundingClientRect().bottom + (narrow ? 44 : 30);
    // On desktop the equipment panel and the info card sit at the sides; on phones they stack below.
    const below = narrow ? [$('tabbar'), $('gear'), $('scope-bar')] : [timebar];
    let bottom = height;
    for (const el of below) {
      if (el.hidden || el.offsetParent === null) continue;
      bottom = Math.min(bottom, el.getBoundingClientRect().top - 10);
    }
    let left = 0, right = width;
    if (!narrow) {
      const gearBox = $('gear').getBoundingClientRect();
      if (!$('gear').hidden && gearBox.width) left = gearBox.right + 8;
      const infoBox = info.getBoundingClientRect();
      if (!info.hidden && infoBox.width) right = infoBox.left - 8;
      // Keep the eyepiece centred when only one side is taken, unless that wastes too much room.
      const margin = Math.max(left, width - right);
      if (width - 2 * margin > 0.5 * width) { left = margin; right = width - margin; }
    }
    sky.setScopeArea(top, bottom, left, right);
  }

  // ---------------------------------------------------------------- language
  const languageSelect = $<HTMLSelectElement>('language');
  for (const l of LANGS) languageSelect.add(new Option(langName(l), l));
  languageSelect.value = lang();
  languageSelect.addEventListener('change', () => setLang(languageSelect.value as Lang));
  onLangChange(() => {
    languageSelect.value = lang();
    speedSelect.querySelectorAll('option').forEach((o, i) => { o.textContent = speedLabel(i); });
    skyQuality.querySelectorAll('option').forEach((o, i) => { o.textContent = t(`sky.${i}` as MsgKey); });
    optionsSignature = '';
    if (state.telescopeMode) refreshStops();
    syncControls();
    updateInfo(true);
    lastClock = -Infinity;
  });

  // ---------------------------------------------------------------- phones
  mobile = new MobileShell({
    state,
    setTelescope,
    syncControls,
    placeLabel,
    nextDark: () => nextDark(state.time, state.lat, state.lon),
    openSearch: () => searchUi.open(),
    closeSearch: () => searchUi.close(),
    stopTracking: () => { tracking = false; $<HTMLInputElement>('info-track').checked = false; },
    closeInfo: () => { selection = null; tracking = false; updateInfo(true); },
  });
  const shell = mobile;

  // ---------------------------------------------------------------- quick guide
  const guide = new Guide({
    placeLabel,
    setTelescope: (on: boolean) => setTelescope(on),
    isTelescope: () => state.telescopeMode,
    closePanels: () => { panel.classList.add('collapsed'); shell.closeSheets(); searchUi.close(); },
    phone: () => PHONE.matches,
  });
  $('guide-toggle').addEventListener('click', () => guide.start());
  $('guide-open').addEventListener('click', () => guide.start());
  // First visit: offer the guide, unless the page was opened on a shared view.
  const q = new URLSearchParams(location.search);
  const sharedView = ['target', 'scope', 't', 'guide'].some((k) => q.has(k));
  if (!sharedView && !Guide.seen()) setTimeout(() => guide.start(), 700);

  // ---------------------------------------------------------------- loop
  const clockLocal = $('clock-local'), clockUtc = $('clock-utc'), clockPlace = $('clock-place');
  let lastFrame = performance.now();
  let lastClock = -Infinity;
  let lastStops = -Infinity;
  let lastFilter = '';
  syncControls();

  function frame(now: number) {
    const dtSec = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state.playing) state.time += dtSec * 1000 * SPEEDS[state.speedIndex].rate;

    if (tracking && selection && !mobile?.gyro.running) {
      sky.update(state, width, height);
      centerOn(selection);
    }
    if (state.telescopeMode) placeEyepiece();
    const f = sky.update(state, width, height);
    if (state.telescopeMode && now - lastStops > 1000) {
      lastStops = now;
      refreshStops(false);
    }

    // Diffraction and seeing: past the useful magnification the image goes soft.
    let filter = '';
    if (state.telescopeMode) {
      const s = telescopeStats(state.telescope);
      const airyArcsec = 138 / state.telescope.aperture; // 1.22 λ/D at 550 nm
      const seeingArcsec = 1.2;
      const blurArcsec = Math.hypot(airyArcsec, seeingArcsec) * 0.5;
      const px = ((blurArcsec / 3600) / sky.camera.fov) * height;
      const extra = Math.max(0, s.magnification / s.maxUsefulMagnification - 1) * 1.5;
      const blur = Math.max(0, px - 0.6) + extra;
      if (blur > 0.15) filter = `blur(${blur.toFixed(2)}px)`;
    }
    if (filter !== lastFilter) { glCanvas.style.filter = filter; lastFilter = filter; }

    sky.render();
    overlay.draw(sky, state, selection, width, height);
    updateInfo();

    if (now - lastClock > 200) {
      lastClock = now;
      const d = new Date(state.time);
      const lat = `${num(Math.abs(state.lat), 2)}°${state.lat >= 0 ? 'N' : 'S'}`;
      const lon = `${num(Math.abs(state.lon), 2)}°${localCompass(state.lon >= 0 ? 'E' : 'W')}`;
      clockLocal.textContent = d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'medium' });
      clockUtc.textContent = `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC · LST ${formatRA(f.lst).slice(0, 7)}`;
      clockPlace.textContent = `${placeLabel()} ${lat} ${lon} · ${t('clock.sun', { alt: `${num(f.sunAlt, 1)}°` })}`;
      dayHint.hidden = state.telescopeMode || f.daylight < 0.5 || document.body.classList.contains('sheet-open');
      shell.tick();
      if (document.activeElement !== dt) dt.value = toLocalInput(state.time);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = t('app.error', { error: err instanceof Error ? err.message : String(err) });
});
