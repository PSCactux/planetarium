const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Right ascension in degrees as "05h 55m 10.3s". */
export function formatRA(deg: number): string {
  let s = (((deg / 15) % 24) + 24) % 24 * 3600;
  s = Math.round(s * 10) / 10;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${pad(h % 24)}h ${pad(m)}m ${sec}s`;
}

/** Signed angle in degrees as "+07° 24′ 25″". */
export function formatDMS(deg: number): string {
  const sign = deg < 0 ? '−' : '+';
  const total = Math.round(Math.abs(deg) * 3600);
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${sign}${pad(d)}° ${pad(m)}′ ${pad(total % 60)}″`;
}

export function formatDeg(deg: number, digits = 1): string {
  return `${deg.toFixed(digits)}°`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compass(az: number): string {
  return COMPASS[Math.round(az / 22.5) % 16];
}

/** Value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
