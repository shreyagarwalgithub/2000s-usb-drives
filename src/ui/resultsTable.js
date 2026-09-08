import { ContentType, ContentTypeLabel } from '../classification/types.js';
import { formatBytes } from '../utils/format.js';

/**
 * Maximum number of files listed in the table. Beyond this the list is removed
 * to keep the page usable: the per-category Summary and the Logs still give the
 * full picture, so a giant row-by-row list adds noise rather than value.
 */
export const MAX_LISTED_FILES = 100;

/**
 * Streaming results table. Rows are appended as files are classified, and can
 * be filtered by content type. Rendering is batched via requestAnimationFrame
 * so appending thousands of rows stays smooth.
 *
 * If the number of classified files exceeds MAX_LISTED_FILES, the list is
 * dropped entirely and a notice explains why.
 */
export class ResultsTable {
  constructor() {
    this.section = document.getElementById('results-section');
    this.tbody = document.querySelector('#results-table tbody');
    this.tableWrap = document.querySelector('.table-wrap');
    this.filter = document.getElementById('type-filter');
    this.filterLabel = this.filter.closest('label');
    this.notice = document.getElementById('results-notice');
    /** Rows waiting to be flushed into the DOM. */
    this._buffer = [];
    this._pending = false;
    /** Content types we have already added to the filter dropdown. */
    this._filterTypes = new Set();
    /** Total files seen this run (may exceed what is shown). */
    this._total = 0;
    /** Once true, we stop keeping the list and show the "removed" notice. */
    this._listRemoved = false;

    this.filter.addEventListener('change', () => this._applyFilter());
  }

  show() {
    this.section.hidden = false;
  }

  /** Reset all state so the table can be reused for a fresh scan. */
  reset() {
    this._buffer = [];
    this._pending = false;
    this._filterTypes = new Set();
    this._total = 0;
    this._listRemoved = false;
    this.tbody.innerHTML = '';
    this.tableWrap.hidden = false;
    if (this.filterLabel) this.filterLabel.hidden = false;
    this.notice.hidden = true;
    this.notice.textContent = '';
    // Reset the filter dropdown to just "All types".
    this.filter.value = '';
    while (this.filter.options.length > 1) {
      this.filter.remove(this.filter.options.length - 1);
    }
  }

  /** @returns {boolean} Whether the list was removed for being too large. */
  get listRemoved() {
    return this._listRemoved;
  }

  /**
   * Append one classified file to the table.
   * @param {Object} row
   * @param {string} row.name
   * @param {string} row.path
   * @param {number} row.size
   * @param {string} row.type       One of ContentType.
   * @param {string} row.mime
   * @param {string} row.detectedBy
   */
  add(row) {
    this._total += 1;

    // Once we cross the cap, drop the list once and never rebuild it.
    if (this._total > MAX_LISTED_FILES) {
      if (!this._listRemoved) this._removeList();
      return;
    }

    this._buffer.push(row);
    this._ensureFilterOption(row.type);
    this._scheduleFlush();
  }

  /**
   * Remove the file list and show a notice. Called once, the first time the
   * classified-file count exceeds MAX_LISTED_FILES.
   */
  _removeList() {
    this._listRemoved = true;
    this._buffer = [];
    this.tbody.innerHTML = '';
    this.tableWrap.hidden = true;
    if (this.filterLabel) this.filterLabel.hidden = true;
    this.notice.hidden = false;
    this.notice.textContent =
      `The file list was large (more than ${MAX_LISTED_FILES} files), so it has ` +
      `been removed to keep the page responsive. See the Summary above for ` +
      `counts and sizes per category, and the Logs for scan details.`;
  }

  _ensureFilterOption(type) {
    if (this._filterTypes.has(type)) return;
    this._filterTypes.add(type);
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = ContentTypeLabel[type] || type;
    this.filter.appendChild(opt);
  }

  _scheduleFlush() {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._flush();
      this._pending = false;
    });
  }

  _flush() {
    const active = this.filter.value;
    const frag = document.createDocumentFragment();
    for (const row of this._buffer) {
      frag.appendChild(this._buildRow(row, active));
    }
    this._buffer = [];
    this.tbody.appendChild(frag);
  }

  _buildRow(row, activeFilter) {
    const tr = document.createElement('tr');
    tr.dataset.type = row.type;
    if (activeFilter && activeFilter !== row.type) {
      tr.hidden = true;
    }

    tr.appendChild(cell(row.name));
    tr.appendChild(cell(row.mime || '-'));
    tr.appendChild(cell(ContentTypeLabel[row.type] || row.type, 'cat-' + row.type));
    tr.appendChild(cell(row.size >= 0 ? formatBytes(row.size) : '-'));
    tr.appendChild(cell(row.path, 'path'));
    tr.appendChild(cell(row.detectedBy));
    return tr;
  }

  _applyFilter() {
    const active = this.filter.value;
    for (const tr of this.tbody.children) {
      tr.hidden = active ? tr.dataset.type !== active : false;
    }
  }
}

/**
 * Build a table cell.
 * @param {string} text
 * @param {string} [className]
 * @returns {HTMLTableCellElement}
 */
function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}
