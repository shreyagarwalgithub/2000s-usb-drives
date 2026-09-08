import { formatBytes, formatCount } from '../utils/format.js';
import { buildSizeTree, sortedChildren, findNode } from '../report/sizeTree.js';

/**
 * An ncdu-style interactive disk-usage browser.
 *
 * Shows one directory level at a time: its children sorted largest-first, each
 * with a proportional size bar. Click a folder to drill in; use the breadcrumb
 * (or the ".." row) to go back up. Built entirely from the scan's file records,
 * so it works live and from a loaded report.
 */
export class TreeBrowser {
  constructor() {
    this.section = document.getElementById('tree-section');
    this.breadcrumb = document.getElementById('tree-breadcrumb');
    this.list = document.getElementById('tree-list');
    /** @type {import('../report/sizeTree.js').TreeNode|null} */
    this.root = null;
    /** @type {import('../report/sizeTree.js').TreeNode|null} */
    this.current = null;
  }

  show() {
    this.section.hidden = false;
  }

  reset() {
    this.root = null;
    this.current = null;
    this.breadcrumb.innerHTML = '';
    this.list.innerHTML = '';
    this.section.hidden = true;
  }

  /**
   * Build the tree from file records and render the root level.
   * @param {Array<{ path: string, size: number, type?: string }>} fileRecords
   */
  render(fileRecords) {
    if (!fileRecords || fileRecords.length === 0) {
      this.reset();
      return;
    }
    this.root = buildSizeTree(fileRecords);
    this.current = this.root;
    this.show();
    this._renderLevel();
  }

  /**
   * Navigate to a directory node by path.
   * @param {string} path
   */
  _navigateTo(path) {
    const node = findNode(this.root, path);
    if (node && node.isDir) {
      this.current = node;
      this._renderLevel();
    }
  }

  _renderLevel() {
    this._renderBreadcrumb();
    this._renderRows();
  }

  _renderBreadcrumb() {
    this.breadcrumb.innerHTML = '';
    // Build the chain from root to current.
    const chain = [];
    // Walk from current up to root using path prefixes.
    const rootPath = this.root.path;
    const rel = this.current.path.slice(rootPath.length).split('/').filter(Boolean);

    // Root crumb.
    chain.push({ label: this.root.name || '(root)', path: rootPath });
    let acc = rootPath;
    for (const seg of rel) {
      acc = acc ? `${acc}/${seg}` : seg;
      chain.push({ label: seg, path: acc });
    }

    chain.forEach((crumb, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'tree-crumb-sep';
        sep.textContent = ' / ';
        this.breadcrumb.appendChild(sep);
      }
      if (i === chain.length - 1) {
        const cur = document.createElement('span');
        cur.className = 'tree-crumb current';
        cur.textContent = crumb.label;
        this.breadcrumb.appendChild(cur);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tree-crumb';
        btn.textContent = crumb.label;
        btn.addEventListener('click', () => this._navigateTo(crumb.path));
        this.breadcrumb.appendChild(btn);
      }
    });
  }

  _renderRows() {
    this.list.innerHTML = '';
    const children = sortedChildren(this.current);
    // Scale bars relative to the largest child in this level.
    const max = children.length ? children[0].size : 0;

    // ".." row to go up, unless we're at the effective root.
    if (this.current !== this.root) {
      const parentPath = this._parentPath(this.current.path);
      const up = this._buildRow({
        name: '..',
        isDir: true,
        size: -1,
        fileCount: 0,
        _up: true,
        _upPath: parentPath,
      }, max);
      this.list.appendChild(up);
    }

    for (const child of children) {
      this.list.appendChild(this._buildRow(child, max));
    }
  }

  _parentPath(path) {
    const idx = path.lastIndexOf('/');
    return idx > 0 ? path.slice(0, idx) : this.root.path;
  }

  /**
   * Build one row.
   * @param {import('../report/sizeTree.js').TreeNode & { _up?: boolean, _upPath?: string }} node
   * @param {number} maxSize
   * @returns {HTMLElement}
   */
  _buildRow(node, maxSize) {
    const row = document.createElement('div');
    row.className = 'tree-row' + (node.isDir ? ' is-dir' : ' is-file');

    // Size column.
    const size = document.createElement('span');
    size.className = 'tree-size';
    size.textContent = node._up ? '' : formatBytes(node.size);

    // Bar column.
    const barWrap = document.createElement('span');
    barWrap.className = 'tree-bar';
    if (!node._up && maxSize > 0) {
      const fill = document.createElement('span');
      fill.className = 'tree-bar-fill';
      const pct = Math.max(2, Math.round((node.size / maxSize) * 100));
      fill.style.width = `${pct}%`;
      barWrap.appendChild(fill);
    }

    // Name column.
    const name = document.createElement('span');
    name.className = 'tree-name';
    if (node.isDir) {
      const icon = node._up ? '\u2191 ' : '\u{1F4C1} ';
      name.textContent = icon + node.name + (node._up ? '' : '/');
    } else {
      name.textContent = '\u{1F4C4} ' + node.name;
    }

    // Count column (dirs only).
    const count = document.createElement('span');
    count.className = 'tree-count';
    if (node.isDir && !node._up) {
      count.textContent = `${formatCount(node.fileCount)} files`;
    }

    row.append(size, barWrap, name, count);

    // Directories are clickable to drill in (or up).
    if (node.isDir) {
      row.classList.add('clickable');
      row.addEventListener('click', () => {
        if (node._up) this._navigateTo(node._upPath);
        else this._navigateTo(node.path);
      });
    }

    return row;
  }
}
