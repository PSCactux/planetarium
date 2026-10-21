// The quick guide shown on the first visit: a few steps that light up each part of the
// screen. Some steps are done by doing the thing itself (dragging the sky, pressing the
// telescope button); "Next" does it for you.
import { LANGS, type Lang, type MsgKey, lang, langName, onLangChange, setLang, t } from '../i18n';
import { gyroAvailable } from './gyro';

const SEEN_KEY = 'planetarium.guide';

interface Hooks {
  placeLabel: () => string;
  setTelescope: (on: boolean) => void;
  isTelescope: () => boolean;
  closePanels: () => void;
  /** True on phones, where the controls live in the tab bar. */
  phone: () => boolean;
}

interface Step {
  /** Element to light up (desktop and phone selectors); none for the welcome card. */
  target?: string;
  phoneTarget?: string;
  /** Only on phones with motion sensors. */
  phoneOnly?: boolean;
  title: MsgKey;
  text: MsgKey;
  /** Runs when the step opens (e.g. to make sure its element is on screen). */
  enter?: () => void;
  /** Event that completes the step by itself. */
  doneOn?: { selector: string; event: string };
  /** What "Next" does besides moving on. */
  next?: () => void;
}

export class Guide {
  private root = document.getElementById('guide') as HTMLElement;
  private spot = this.root.querySelector('.guide-spot') as HTMLElement;
  private card = this.root.querySelector('.guide-card') as HTMLElement;
  private allSteps: Step[];
  private steps: Step[] = [];
  private index = 0;
  private cleanup: (() => void) | null = null;
  private raf = 0;

  static seen(): boolean {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
  }

  constructor(private hooks: Hooks) {
    this.allSteps = [
      { title: 'guide.welcomeTitle', text: 'guide.welcome' },
      { target: '#gl', title: 'guide.skyTitle', text: 'guide.sky', doneOn: { selector: '#gl', event: 'pointerup' } },
      { target: '#gyro-btn', phoneTarget: '#gyro-btn', phoneOnly: true, title: 'guide.gyroTitle', text: 'guide.gyro' },
      { target: '#search-toggle', phoneTarget: '#tab-search', title: 'guide.searchTitle', text: 'guide.search' },
      { target: '.timebar', phoneTarget: '#tab-time', title: 'guide.timeTitle', text: 'guide.time', enter: () => this.hooks.setTelescope(false) },
      { target: '#panel-toggle', phoneTarget: '#tab-more', title: 'guide.settingsTitle', text: 'guide.settings' },
      {
        target: '#scope-toggle', phoneTarget: '#tab-scope', title: 'guide.scopeTitle', text: 'guide.scope',
        enter: () => this.hooks.setTelescope(false),
        doneOn: { selector: '#scope-toggle, #tab-scope', event: 'click' },
        next: () => this.hooks.setTelescope(true),
      },
      { target: '#gear', title: 'guide.gearTitle', text: 'guide.gear', enter: () => this.hooks.setTelescope(true) },
      { target: '#scope-bar', title: 'guide.targetsTitle', text: 'guide.targets', enter: () => this.hooks.setTelescope(true) },
    ];
    this.card.querySelector('.guide-skip')!.addEventListener('click', () => this.finish());
    this.card.querySelector('.guide-back')!.addEventListener('click', () => this.go(this.index - 1));
    this.card.querySelector('.guide-next')!.addEventListener('click', () => {
      const step = this.steps[this.index];
      if (step.next && !(step.doneOn && this.hooks.isTelescope())) step.next();
      this.advance();
    });
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') this.finish();
      else if (e.key === 'ArrowRight') this.advance();
      else if (e.key === 'ArrowLeft') this.go(this.index - 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    window.addEventListener('resize', () => this.place());
    onLangChange(() => { if (!this.root.hidden) this.render(); });
  }

  start(): void {
    const phone = this.hooks.phone();
    this.steps = this.allSteps.filter((s) => !s.phoneOnly || (phone && gyroAvailable()));
    this.hooks.closePanels();
    this.root.hidden = false;
    this.go(0);
    // Panels open and close while the guide runs: keep the light on its element.
    const follow = () => {
      this.place();
      this.raf = requestAnimationFrame(follow);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(follow);
  }

  private advance(): void {
    if (this.index >= this.steps.length - 1) this.finish();
    else this.go(this.index + 1);
  }

  private go(i: number): void {
    if (i < 0 || i >= this.steps.length) return;
    this.cleanup?.();
    this.cleanup = null;
    this.index = i;
    const step = this.steps[i];
    step.enter?.();
    if (step.doneOn) {
      const els = [...document.querySelectorAll(step.doneOn.selector)];
      const handler = () => {
        // Let the click do its job first, then move on.
        setTimeout(() => { if (this.index === i) this.advance(); }, step.doneOn!.selector === '#gl' ? 700 : 350);
      };
      for (const el of els) el.addEventListener(step.doneOn.event, handler, { once: true });
      this.cleanup = () => { for (const el of els) el.removeEventListener(step.doneOn!.event, handler); };
    }
    this.render();
  }

  private render(): void {
    const step = this.steps[this.index];
    const total = this.steps.length;
    const last = this.index === total - 1;
    const welcome = this.index === 0;
    (this.card.querySelector('.guide-step') as HTMLElement).textContent = welcome ? '' : t('guide.step', { n: this.index, total: total - 1 });
    (this.card.querySelector('#guide-title') as HTMLElement).textContent = t(step.title);
    (this.card.querySelector('.guide-text') as HTMLElement).textContent = t(step.text, { place: this.hooks.placeLabel() });
    const skip = this.card.querySelector('.guide-skip') as HTMLButtonElement;
    const back = this.card.querySelector('.guide-back') as HTMLButtonElement;
    const next = this.card.querySelector('.guide-next') as HTMLButtonElement;
    skip.textContent = t('guide.skip');
    skip.hidden = last;
    back.textContent = t('guide.back');
    back.hidden = this.index <= 1;
    next.textContent = welcome ? t('guide.start') : last ? t('guide.done') : t('guide.next');
    // Language choice on the welcome card.
    const langs = this.card.querySelector('.guide-langs') as HTMLElement;
    langs.hidden = !welcome;
    if (welcome) {
      langs.replaceChildren(...LANGS.map((l: Lang) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = langName(l);
        b.setAttribute('aria-pressed', String(l === lang()));
        b.addEventListener('click', () => setLang(l));
        return b;
      }));
    }
    const dots = this.card.querySelector('.guide-dots') as HTMLElement;
    dots.style.setProperty('--p', String(this.index / (total - 1)));
    this.card.classList.toggle('centered', welcome);
    this.place();
    next.focus({ preventScroll: true });
  }

  /** Puts the light around the step's element and the card next to it. */
  private place(): void {
    if (this.root.hidden) return;
    const step = this.steps[this.index];
    const selector = this.hooks.phone() && step.phoneTarget ? step.phoneTarget : step.target;
    const el = selector ? document.querySelector<HTMLElement>(selector) : null;
    // Fixed-position elements have no offsetParent; a zero-sized box means hidden.
    const rect = el?.getBoundingClientRect();
    const box = rect && rect.width > 0 && rect.height > 0 ? rect : null;
    const W = window.innerWidth, H = window.innerHeight;
    if (!box || step.target === '#gl') {
      // Whole sky (or nothing): a soft, open spotlight.
      this.spot.className = 'guide-spot ' + (step.target === '#gl' ? 'sky' : 'none');
      this.spot.removeAttribute('style');
    } else {
      const pad = 6;
      this.spot.className = 'guide-spot';
      Object.assign(this.spot.style, {
        left: `${box.left - pad}px`, top: `${box.top - pad}px`,
        width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px`,
      });
    }
    // Card: centred for the welcome and the sky; otherwise beside the element, kept on screen.
    const card = this.card.getBoundingClientRect();
    let x = (W - card.width) / 2, y = (H - card.height) / 2;
    if (box && step.target !== '#gl') {
      const narrow = W < 640;
      const below = box.top + box.height / 2 < H / 2;
      if (narrow) {
        x = (W - card.width) / 2;
        y = below ? Math.min(H - card.height - 12, box.bottom + 14) : Math.max(12, box.top - card.height - 14);
      } else if (box.width > W * 0.5 || box.height < 80 || box.left + box.width / 2 > W * 0.35 && box.left + box.width / 2 < W * 0.65) {
        x = Math.min(Math.max(12, box.left + box.width / 2 - card.width / 2), W - card.width - 12);
        y = below ? box.bottom + 14 : box.top - card.height - 14;
      } else {
        const right = box.left + box.width / 2 < W / 2;
        x = right ? box.right + 16 : box.left - card.width - 16;
        y = Math.min(Math.max(12, box.top + box.height / 2 - card.height / 2), H - card.height - 12);
      }
      y = Math.min(Math.max(12, y), H - card.height - 12);
    } else if (step.target === '#gl') {
      y = Math.max(12, H * 0.62 - card.height / 2);
    }
    this.card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  private finish(): void {
    this.cleanup?.();
    this.cleanup = null;
    cancelAnimationFrame(this.raf);
    this.root.hidden = true;
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* shown again next time */ }
  }
}
