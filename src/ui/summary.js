import { ContentType, ContentTypeLabel } from '../classification/types.js';
import { formatBytes, formatCount } from '../utils/format.js';

/**
 * Per-category summary cards: file count and total size for each content type.
 * Aggregates are maintained incrementally as files stream in.
 */
export class Summary {
  constructor() {
    this.section = document.getElementById('summary-section');
    this.cards = document.getElementById('summary-cards');
    /** @type {Map<string, { count: number, size: number }>} */
    this.totals = new Map();
    this._pending = false;
  }

  show() {
    this.section.hidden = false;
  }

  /**
   * Record one classified file.
   * @param {string} type One of ContentType.
   * @param {number} size Bytes (may be 0 if unknown).
   */
  add(type, size) {
    const t = this.totals.get(type) || { count: 0, size: 0 };
    t.count += 1;
    t.size += Number.isFinite(size) && size > 0 ? size : 0;
    this.totals.set(type, t);
    this._scheduleRender();
  }

  _scheduleRender() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._render();
      this._pending = false;
    });
  }

  _render() {
    // Show categories ordered by descending file count.
    const entries = [...this.totals.entries()].sort(
      (a, b) => b[1].count - a[1].count
    );
    this.cards.innerHTML = '';
    for (const [type, { count, size }] of entries) {
      const card = document.createElement('div');
      card.className = 'summary-card';
      card.dataset.type = type;

      const label = document.createElement('div');
      label.className = 'summary-card-label';
      label.textContent = ContentTypeLabel[type] || type;

      const count_ = document.createElement('div');
      count_.className = 'summary-card-count';
      count_.textContent = `${formatCount(count)} files`;

      const size_ = document.createElement('div');
      size_.className = 'summary-card-size';
      size_.textContent = formatBytes(size);

      card.append(label, count_, size_);
      this.cards.appendChild(card);
    }
  }
}
