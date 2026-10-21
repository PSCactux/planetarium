// Phone layout: a tab bar, bottom sheets that can be dragged, a time sheet with a jog strip and
// "point your phone at the sky". Desktop keeps the floating panels and the time bar.
import type { AppState } from '../state';
import { type MsgKey, locale, onLangChange, t } from '../i18n';
import { makeDraggable } from './sheet';
import { GyroControl, gyroAvailable } from './gyro';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Breakpoint shared with the CSS. */
export const PHONE = matchMedia('(max-width: 640px)');

export interface MobileHooks {
  state: AppState;
  setTelescope: (on: boolean) => void;
  syncControls: () => void;
  placeLabel: () => string;
  nextDark: () => number | null;
  openSearch: () => void;
  closeSearch: () => void;
  /** The user moved the view by hand: stop following the target. */
  stopTracking: () => void;
  closeInfo: () => void;
}

type Sheet = 'none' | 'time' | 'more';

/** Speed choices on the time sheet, as indices into SPEEDS. */
const SPEED_CHOICES = [0, 1, 4, 7, 8];

export class MobileShell {
  private sheet: Sheet = 'none';
  readonly gyro: GyroControl;
  private gyroUi = $('gyro-ui');

  constructor(private h: MobileHooks) {
    const s = h.state;
    // ---- tabs
    $('tab-sky').addEventListener('click', () => { this.closeSheets(); h.closeSearch(); h.setTelescope(false); });
    $('tab-scope').addEventListener('click', () => {
      this.closeSheets();
      h.closeSearch();
      if (s.telescopeMode) this.toggleGear(); else h.setTelescope(true);
    });
    $('tab-search').addEventListener('click', () => { this.closeSheets(); h.openSearch(); });
    $('tab-time').addEventListener('click', () => this.open(this.sheet === 'time' ? 'none' : 'time'));
    $('tab-more').addEventListener('click', () => this.open(this.sheet === 'more' ? 'none' : 'more'));

    // ---- sheets that can be dragged
    makeDraggable($('timesheet'), { grip: $('ts-grip'), onSwipe: (d) => { if (d === 'down') this.open('none'); } });
    makeDraggable($('panel'), { grip: $('panel-grip'), onSwipe: (d) => { if (d === 'down') this.open('none'); } });
    makeDraggable($('gear'), {
      grip: $('gear-grip'),
      onSwipe: (d) => this.setGear(d === 'up'),
      onTap: () => this.toggleGear(),
    });
    const info = $('info');
    makeDraggable(info, {
      grip: $('info-grip'),
      onSwipe: (d) => {
        if (d === 'up') this.setInfoExpanded(true);
        else if (info.classList.contains('expanded')) this.setInfoExpanded(false);
        else h.closeInfo();
      },
      onTap: () => this.setInfoExpanded(!info.classList.contains('expanded')),
    });
    $('info-more').addEventListener('click', () => this.setInfoExpanded(!info.classList.contains('expanded')));
    $('panel-close').addEventListener('click', () => this.open('none'));

    // ---- time sheet
    $('ts-play').addEventListener('click', () => { s.playing = !s.playing; h.syncControls(); });
    $('ts-now').addEventListener('click', () => { s.time = Date.now(); s.speedIndex = 4; s.playing = true; h.syncControls(); });
    $('ts-tonight').addEventListener('click', () => {
      const night = h.nextDark();
      if (night !== null) { s.time = night; s.speedIndex = 4; s.playing = true; h.syncControls(); }
    });
    const speeds = $('ts-speeds');
    for (const i of SPEED_CHOICES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.speed = String(i);
      b.addEventListener('click', () => { s.speedIndex = i; s.playing = true; h.syncControls(); });
      speeds.append(b);
    }
    this.setupJog();

    // ---- point your phone
    this.gyro = new GyroControl((p) => {
      s.alt = Math.max(-30, Math.min(89.9, p.alt));
      s.az = p.az;
      s.roll = p.roll;
    });
    this.gyroUi.hidden = !gyroAvailable();
    $('gyro-btn').addEventListener('click', () => (this.gyro.running ? this.stopGyro() : this.startGyro()));
    $('gyro-pill').addEventListener('click', () => this.stopGyro());

    onLangChange(() => this.sync());
    PHONE.addEventListener('change', () => this.layout());
    this.layout();
  }

  /** Puts the target selector where it belongs for the screen size. */
  private layout(): void {
    const phone = PHONE.matches;
    document.body.classList.toggle('phone', phone);
    const bar = $('scope-bar');
    const home = phone ? $('app') : document.querySelector('.timebar')!;
    if (bar.parentElement !== home) home.append(bar);
    if (!phone) { this.open('none'); this.stopGyro(); }
    this.sync();
  }

  get phone(): boolean {
    return PHONE.matches;
  }

  /** Opens one sheet (time or settings) and closes the other ones. */
  open(sheet: Sheet): void {
    this.sheet = sheet;
    $('timesheet').hidden = sheet !== 'time';
    if (this.phone) $('panel').classList.toggle('collapsed', sheet !== 'more');
    if (sheet !== 'none') this.h.closeSearch();
    this.sync();
  }

  closeSheets(): void {
    if (this.sheet !== 'none') this.open('none');
  }

  private toggleGear(): void {
    this.setGear($('gear').classList.contains('collapsed'));
  }

  setGear(open: boolean): void {
    $('gear').classList.toggle('collapsed', !open);
    $('gear-toggle').setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('gear-open', open);
  }

  setInfoExpanded(on: boolean): void {
    $('info').classList.toggle('expanded', on);
    $('info-more').setAttribute('aria-expanded', String(on));
    $('info-more').textContent = t(on ? 'info.less' : 'info.more');
  }

  async startGyro(): Promise<void> {
    const ok = await this.gyro.start();
    if (!ok) { alert(t('gyro.denied')); return; }
    this.h.stopTracking();
    this.h.state.fov = Math.max(this.h.state.fov, 60);
    this.sync();
  }

  stopGyro(): void {
    if (!this.gyro.running) return;
    this.gyro.stop();
    this.h.state.roll = 0;
    this.sync();
  }

  /** Drag left or right to move in time, faster the further the finger travels. */
  private setupJog(): void {
    const jog = $('ts-jog');
    const ticks = jog.querySelector('.ts-ticks') as HTMLElement;
    let lastX = 0, active = false, offset = 0;
    jog.addEventListener('pointerdown', (e) => {
      active = true;
      lastX = e.clientX;
      jog.setPointerCapture(e.pointerId);
      jog.classList.add('dragging');
    });
    jog.addEventListener('pointermove', (e) => {
      if (!active) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      // About 3 minutes per pixel for slow drags, up to an hour per pixel for quick flicks.
      const minutes = Math.sign(dx) * Math.min(60, 3 * Math.abs(dx) ** 1.35);
      const before = Math.floor(this.h.state.time / 3600000);
      this.h.state.time += minutes * 60000;
      if (Math.floor(this.h.state.time / 3600000) !== before) navigator.vibrate?.(4);
      offset += dx;
      ticks.style.backgroundPositionX = `${offset}px`;
    });
    const end = () => { active = false; jog.classList.remove('dragging'); };
    jog.addEventListener('pointerup', end);
    jog.addEventListener('pointercancel', end);
    jog.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 24 : 1;
      if (e.key === 'ArrowRight') this.h.state.time += step * 3600000;
      else if (e.key === 'ArrowLeft') this.h.state.time -= step * 3600000;
      else return;
      e.preventDefault();
    });
  }

  /** Called every few frames: clock on the time sheet. */
  tick(): void {
    if (this.sheet !== 'time') return;
    const d = new Date(this.h.state.time);
    $('ts-title').textContent = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('ts-date').textContent = `${d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${this.h.placeLabel()}`;
  }

  /** Brings tabs, buttons and labels in line with the state. */
  sync(): void {
    const s = this.h.state;
    const tabs: [string, boolean][] = [
      ['tab-sky', !s.telescopeMode && this.sheet === 'none'],
      ['tab-scope', s.telescopeMode && this.sheet === 'none'],
      ['tab-time', this.sheet === 'time'],
      ['tab-more', this.sheet === 'more'],
      ['tab-search', false],
    ];
    for (const [id, on] of tabs) {
      $(id).classList.toggle('active', on);
      $(id).setAttribute('aria-pressed', String(on));
    }
    $('ts-play-icon').setAttribute('href', s.playing ? '#i-pause' : '#i-play');
    for (const b of $('ts-speeds').querySelectorAll<HTMLButtonElement>('.chip')) {
      const i = Number(b.dataset.speed);
      b.textContent = t(`speed.${i}` as MsgKey);
      b.classList.toggle('active', s.playing && s.speedIndex === i);
    }
    const gyroOn = this.gyro?.running ?? false;
    $('gyro-btn').classList.toggle('active', gyroOn);
    $('gyro-btn').setAttribute('aria-pressed', String(gyroOn));
    $('gyro-pill').hidden = !gyroOn;
    this.gyroUi.hidden = !gyroAvailable() || !this.phone || s.telescopeMode;
    document.body.classList.toggle('sheet-open', this.sheet !== 'none');
    this.tick();
  }
}

