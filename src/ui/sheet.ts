// Bottom sheets on phones: drag the handle (or the header) to expand, collapse or close.

export interface SheetOptions {
  /** Element that starts a drag (a handle or a header). */
  grip: HTMLElement;
  /** Called with 'up' or 'down' when a drag ends far enough; a short tap calls onTap. */
  onSwipe: (dir: 'up' | 'down') => void;
  onTap?: () => void;
}

export function makeDraggable(sheet: HTMLElement, opts: SheetOptions): void {
  let startY = 0, dy = 0, dragging = false, id = -1, startT = 0;
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    const fast = Math.abs(dy) / Math.max(1, performance.now() - startT) > 0.5;
    if (dy > 60 || (fast && dy > 20)) opts.onSwipe('down');
    else if (dy < -40 || (fast && dy < -15)) opts.onSwipe('up');
    else if (Math.abs(dy) < 6) opts.onTap?.();
  };
  opts.grip.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button:not(.sheet-grip), select, input, a')) return;
    dragging = true;
    id = e.pointerId;
    startY = e.clientY;
    startT = performance.now();
    dy = 0;
    opts.grip.setPointerCapture(id);
    sheet.style.transition = 'none';
  });
  opts.grip.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== id) return;
    dy = e.clientY - startY;
    // Follow the finger downwards; resist going up.
    const shown = dy > 0 ? dy : dy / 3;
    sheet.style.transform = `translateY(${shown}px)`;
  });
  opts.grip.addEventListener('pointerup', end);
  opts.grip.addEventListener('pointercancel', end);
}
