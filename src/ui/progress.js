import { formatCount } from '../utils/format.js';

/**
 * Live scan progress: how many files have been seen and the current path.
 * Updates are throttled with requestAnimationFrame so a fast scan doesn't
 * thrash the DOM.
 */
export class Progress {
  constructor() {
    this.section = document.getElementById('progress-section');
    this.countEl = document.getElementById('progress-count');
    this.currentEl = document.getElementById('progress-current');
    this.cancelBtn = document.getElementById('cancel-scan');
    this._count = 0;
    this._current = '';
    this._pending = false;
  }

  /** @param {() => void} handler Called when the user clicks Stop. */
  onCancel(handler) {
    this.cancelBtn.addEventListener('click', handler);
  }

  show() {
    this.section.hidden = false;
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
    requestAnimationFrame(() => {
      this.countEl.textContent = `${formatCount(this._count)} files scanned`;
      this.currentEl.textContent = this._current;
      this._pending = false;
    });
  }

  /** @param {number} count Final count when the scan finishes. */
  finish(count) {
    this.countEl.textContent = `Done. ${formatCount(count)} files classified.`;
    this.currentEl.textContent = '';
    this.cancelBtn.hidden = true;
  }
}
