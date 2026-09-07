import { ContentType, ContentTypeLabel } from '../classification/types.js';
import { formatBytes } from '../utils/format.js';

/**
 * Streaming results table. Rows are appended as files are classified, and can
 * be filtered by content type. Rendering is batched via requestAnimationFrame
 * so appending thousands of rows stays smooth.
 */
export class ResultsTable {
  constructor() {
    this.section = document.getElementById('results-section');
    this.tbody = document.querySelector('#results-table tbody');
    this.filter = document.getElementById('type-filter');
    /** Rows waiting to be flushed into the DOM. */
    this._buffer = [];
    this._pending = false;
    /** Content types we have already added to the filter dropdown. */
    this._filterTypes = new Set();

    this.filter.addEventListener('change', () => this._applyFilter());
  }

  show() {
    this.section.hidden = false;
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
    this._buffer.push(row);
    this._ensureFilterOption(row.type);
    this._scheduleFlush();
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
