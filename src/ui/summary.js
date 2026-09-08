import {
  ContentType,
  ContentTypeLabel,
  DocumentSubtypeLabel,
} from '../classification/types.js';
import { formatBytes, formatCount, formatPercent } from '../utils/format.js';

/**
 * Per-category summary cards: file count and total size for each content type.
 * For the Document category, a finer breakdown by sub-type (PDF, spreadsheet,
 * presentation, ...) is shown, since documents otherwise dominate as one
 * undifferentiated bucket. Aggregates are maintained incrementally as files
 * stream in.
 */
export class Summary {
  constructor() {
    this.section = document.getElementById('summary-section');
    this.cards = document.getElementById('summary-cards');
    /** @type {Map<string, { count: number, size: number }>} */
    this.totals = new Map();
    /** Document sub-type totals: subtype -> { count, size }. */
    this.docSubtypes = new Map();
    this._pending = false;
  }

  show() {
    this.section.hidden = false;
  }

  /** Clear all totals so the summary can be reused for a fresh scan. */
  reset() {
    this.totals = new Map();
    this.docSubtypes = new Map();
    this.cards.innerHTML = '';
  }

  /**
   * Record one classified file.
   * @param {string} type      One of ContentType.
   * @param {number} size      Bytes (may be 0 if unknown).
   * @param {string} [subtype] Document sub-type, when type is DOCUMENT.
   */
  add(type, size, subtype) {
    const safeSize = Number.isFinite(size) && size > 0 ? size : 0;
    const t = this.totals.get(type) || { count: 0, size: 0 };
    t.count += 1;
    t.size += safeSize;
    this.totals.set(type, t);

    if (type === ContentType.DOCUMENT && subtype) {
      const s = this.docSubtypes.get(subtype) || { count: 0, size: 0 };
      s.count += 1;
      s.size += safeSize;
      this.docSubtypes.set(subtype, s);
    }

    this._scheduleRender();
  }

  /**
   * Add an aggregate for a category in one shot. Used when rendering from a
   * saved report, where per-category totals are already known.
   * @param {string} type One of ContentType.
   * @param {number} count Number of files.
   * @param {number} size  Total bytes.
   */
  addAggregate(type, count, size) {
    const t = this.totals.get(type) || { count: 0, size: 0 };
    t.count += Number.isFinite(count) ? count : 0;
    t.size += Number.isFinite(size) ? size : 0;
    this.totals.set(type, t);
    this._scheduleRender();
  }

  /**
   * Add a document sub-type aggregate in one shot (report-render path).
   * @param {string} subtype
   * @param {number} count
   * @param {number} size
   */
  addDocSubtypeAggregate(subtype, count, size) {
    const s = this.docSubtypes.get(subtype) || { count: 0, size: 0 };
    s.count += Number.isFinite(count) ? count : 0;
    s.size += Number.isFinite(size) ? size : 0;
    this.docSubtypes.set(subtype, s);
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
    // Grand totals across all categories, for percentage shares.
    let totalCount = 0;
    let totalSize = 0;
    for (const { count, size } of this.totals.values()) {
      totalCount += count;
      totalSize += size;
    }

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

      // Count line: "1,234 files (18%)"
      const count_ = document.createElement('div');
      count_.className = 'summary-card-count';
      count_.textContent = `${formatCount(count)} files (${formatPercent(
        count,
        totalCount
      )})`;

      // Size line: "4.2 GB (63%)"
      const size_ = document.createElement('div');
      size_.className = 'summary-card-size';
      size_.textContent = `${formatBytes(size)} (${formatPercent(
        size,
        totalSize
      )})`;

      card.append(label, count_, size_);

      // Document sub-type breakdown, nested under the Document card.
      if (type === ContentType.DOCUMENT && this.docSubtypes.size > 0) {
        card.appendChild(this._buildSubtypeBreakdown(count));
      }

      this.cards.appendChild(card);
    }
  }

  /**
   * Build the sub-type breakdown list for the document card.
   * @param {number} docTotal Total document count (for percentage shares).
   * @returns {HTMLElement}
   */
  _buildSubtypeBreakdown(docTotal) {
    const wrap = document.createElement('div');
    wrap.className = 'summary-subtypes';

    const subEntries = [...this.docSubtypes.entries()].sort(
      (a, b) => b[1].count - a[1].count
    );
    for (const [subtype, { count }] of subEntries) {
      const row = document.createElement('div');
      row.className = 'summary-subtype-row';
      row.textContent = `${DocumentSubtypeLabel[subtype] || subtype}: ${formatCount(
        count
      )} (${formatPercent(count, docTotal)})`;
      wrap.appendChild(row);
    }
    return wrap;
  }
}
