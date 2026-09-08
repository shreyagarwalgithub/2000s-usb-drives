import { formatCount } from '../utils/format.js';

/**
 * Live scan progress: a progress bar plus how many files have been seen and the
 * current path. Updates are throttled with requestAnimationFrame so a fast scan
 * doesn't thrash the DOM.
 *
 * The bar runs in one of two modes:
 *   - determinate: a total is known, so it fills to count/total.
 *   - indeterminate: no total yet, so it shows an animated sweep.
 */
export class Progress {
  constructor() {
    this.section = document.getElementById('progress-section');
    this.countEl = document.getElementById('progress-count');
    this.currentEl = document.getElementById('progress-current');
    this.cancelBtn = document.getElementById('cancel-scan');
    this.bar = document.getElementById('progress-bar');
    this.barFill = document.getElementById('progress-bar-fill');
    this._count = 0;
    this._total = 0;
    this._current = '';
    this._pending = false;
  }

  /** @param {() => void} handler Called when the user clicks Stop. */
  onCancel(handler) {
    this.cancelBtn.addEventListener('click', handler);
  }

  show() {
    this.section.hidden = false;
    this.cancelBtn.hidden = false;
  }

  /**
   * Set the total number of files to process. Switches the bar to determinate
   * mode. Pass 0 or omit to keep the bar indeterminate.
   * @param {number} total
   */
  setTotal(total) {
    this._total = Number.isFinite(total) && total > 0 ? total : 0;
    if (this._total > 0) {
      this.bar.classList.remove('indeterminate');
    } else {
      this.bar.classList.add('indeterminate');
    }
  }

  /**
   * @param {number} count   Files scanned so far.
   * @param {string} current Path of the file currently being processed.
   */
  update(count, current) {
    this._count = count;
    this._current = current;
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => this._render());
  }

  _render() {
    this._pending = false;

    if (this._total > 0) {
      const pct = Math.min(100, Math.round((this._count / this._total) * 100));
      this.barFill.style.width = `${pct}%`;
      this.bar.setAttribute('aria-valuenow', String(pct));
      this.countEl.textContent = `${formatCount(this._count)} of ${formatCount(
        this._total
      )} files (${pct}%)`;
    } else {
      this.countEl.textContent = `${formatCount(this._count)} files scanned`;
    }
    this.currentEl.textContent = this._current;
  }

  /** @param {number} count Final count when the scan finishes. */
  finish(count) {
    this.bar.classList.remove('indeterminate');
    this.barFill.style.width = '100%';
    this.bar.setAttribute('aria-valuenow', '100');
    this.countEl.textContent = `Done. ${formatCount(count)} files classified.`;
    this.currentEl.textContent = '';
    this.cancelBtn.hidden = true;
  }

  /** Mark the scan as stopped early by the user. */
  stopped(count) {
    this.bar.classList.remove('indeterminate');
    this.countEl.textContent = `Stopped. ${formatCount(
      count
    )} files classified.`;
    this.currentEl.textContent = '';
    this.cancelBtn.hidden = true;
  }
}
