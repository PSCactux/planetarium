// Find anything by name: planets, the Moon, named stars and deep-sky objects.
import type { Dso, Star } from '../data';
import { PLANETS } from '../astro/solarsystem';
import { horizonVecToAltAz } from '../astro/coords';
import type { Sky, Target } from '../sky/sky';
import { allTranslations, dsoNamesAll, num, t, type MsgKey } from '../i18n';
import { bodyName, dsoLabel } from '../names';

interface Entry {
  /** Labels are built when shown, so they follow the language. */
  label: () => string;
  sub: () => string;
  keys: string[];
  target: Target;
  mag: number;
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function buildSearchIndex(stars: Star[], dso: Dso[]): Entry[] {
  // Every language's name is searchable, whatever language the interface is in.
  const names = (key: MsgKey) => allTranslations(key).map(fold);
  const entries: Entry[] = [
    { label: () => bodyName('moon'), sub: () => t('search.moon'), keys: names('body.moon'), target: { kind: 'moon' }, mag: -12 },
    ...PLANETS.map((p) => ({
      label: () => bodyName(p.id), sub: () => t('info.planet'), keys: names(`body.${p.id}` as MsgKey),
      target: { kind: 'planet', id: p.id } as Target, mag: -2,
    })),
  ];
  stars.forEach((s, index) => {
    if (!s.name && s.mag > 3.5) return;
    entries.push({
      label: () => s.name || s.designation,
      sub: () => `${t('info.star')}${s.name && s.designation ? ` · ${s.designation}` : ''} · mag ${num(s.mag, 1)}`,
      keys: [s.name, s.designation].filter(Boolean).map(fold),
      target: { kind: 'star', index },
      mag: s.mag,
    });
  });
  dso.forEach((o, index) => {
    entries.push({
      label: () => dsoLabel(o),
      sub: () => `${t(`kind.${o.kind}` as MsgKey)} · mag ${num(o.mag, 1)}${o.catalogue !== o.id ? ` · ${o.catalogue}` : ''}`,
      keys: [o.id, o.id.replace(' ', ''), o.name, ...dsoNamesAll(o.id), o.catalogue, o.catalogue.replace(' ', '')].filter(Boolean).map(fold),
      target: { kind: 'dso', index },
      mag: o.mag,
    });
  });
  return entries;
}

export function search(entries: Entry[], query: string, limit = 8): Entry[] {
  const q = fold(query);
  if (!q) return [];
  const scored: [number, Entry][] = [];
  for (const e of entries) {
    let best = Infinity;
    for (const k of e.keys) {
      if (k === q) best = Math.min(best, 0);
      else if (k.startsWith(q)) best = Math.min(best, 1);
      else if (k.includes(` ${q}`)) best = Math.min(best, 2);
      else if (k.includes(q)) best = Math.min(best, 3);
    }
    if (best < Infinity) scored.push([best * 100 + e.mag, e]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, e]) => e);
}

/** Something worth looking at right now, shown while the search box is empty. */
export interface Highlight {
  target: Target;
  label: string;
  sub: string;
}

/**
 * Wires the search box; `go` is called with the chosen target. With an empty box it lists
 * `highlights()`. Returns open/close for other controls (the tab bar on phones).
 */
export function setupSearch(sky: Sky, entries: Entry[], go: (t: Target) => void, highlights: () => Highlight[] = () => []): { open: () => void; close: () => void } {
  const box = document.getElementById('search') as HTMLElement;
  const input = document.getElementById('search-input') as HTMLInputElement;
  const list = document.getElementById('search-results') as HTMLUListElement;
  const toggle = document.getElementById('search-toggle') as HTMLButtonElement;
  let results: { target: Target; label: string; sub: string; below: boolean }[] = [];
  let active = 0;
  const fromEntries = (list: Entry[]) => list.map((e) => {
    const alt = sky.frame ? horizonVecToAltAz(sky.targetVec(e.target)).alt : 0;
    return { target: e.target, label: e.label(), sub: alt < 0 ? `${e.sub()} · ${t('search.below')}` : e.sub(), below: alt < 0 };
  });
  const refresh = () => {
    const q = input.value.trim();
    results = q ? fromEntries(search(entries, q)) : highlights().map((h) => ({ ...h, below: false }));
    box.classList.toggle('empty-query', !q);
    active = 0;
    render();
  };

  const close = () => {
    box.classList.remove('open');
    document.body.classList.remove('search-open');
    toggle.setAttribute('aria-expanded', 'false');
    input.value = '';
    list.replaceChildren();
    input.blur();
  };
  const open = () => {
    box.classList.add('open');
    document.body.classList.add('search-open');
    toggle.setAttribute('aria-expanded', 'true');
    refresh();
    input.focus();
  };
  const choose = (e: { target: Target } | undefined) => {
    if (!e) return;
    go(e.target);
    close();
  };
  const render = () => {
    const items = results.map((e, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === active));
      li.innerHTML = '<span class="s-label"></span><span class="s-sub"></span>';
      li.querySelector('.s-label')!.textContent = e.label;
      li.querySelector('.s-sub')!.textContent = e.sub;
      if (e.below) li.classList.add('below');
      li.addEventListener('click', () => choose(e));
      return li;
    });
    if (!input.value.trim() && items.length) {
      const head = document.createElement('li');
      head.className = 's-head';
      head.setAttribute('role', 'presentation');
      head.textContent = t('search.visible');
      items.unshift(head);
    }
    list.replaceChildren(...items);
  };

  toggle.addEventListener('click', () => (box.classList.contains('open') ? close() : open()));
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { choose(results[active]); ev.preventDefault(); }
    else if (ev.key === 'Escape') close();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === '/' && !(ev.target as HTMLElement).closest('input, select, textarea')) { open(); ev.preventDefault(); }
  });
  // Close by tapping outside the box (phones show it as a full-screen sheet with its own backdrop).
  document.getElementById('search-backdrop')?.addEventListener('click', close);
  document.getElementById('search-cancel')?.addEventListener('click', close);
  return { open, close };
}
