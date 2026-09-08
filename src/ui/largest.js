import { formatBytes, formatCount } from '../utils/format.js';

/**
 * Renders the "Largest files" and "Largest folders" lists. These are computed
 * once at the end of a scan (or loaded from a report), not streamed, so this is
 * a simple one-shot render.
 */
export class Largest {
  constructor() {
    this.section = document.getElementById('largest-section');
    this.filesList = document.getElementById('largest-files');
    this.foldersList = document.getElementById('largest-folders');
  }

  show() {
    this.section.hidden = false;
  }

  reset() {
    this.filesList.innerHTML = '';
    this.foldersList.innerHTML = '';
    this.section.hidden = true;
  }

  /**
   * Render both lists.
   * @param {Array<{ path: string, name: string, size: number }>} files
   * @param {Array<{ folder: string, size: number, count: number }>} folders
   */
  render(files, folders) {
    this.filesList.innerHTML = '';
    for (const f of files || []) {
      const li = document.createElement('li');
      const size = document.createElement('span');
      size.className = 'largest-size';
      size.textContent = formatBytes(f.size);
      const name = document.createElement('span');
      name.className = 'largest-name';
      name.textContent = f.name;
      name.title = f.path;
      li.append(size, name);
      this.filesList.appendChild(li);
    }

    this.foldersList.innerHTML = '';
    for (const f of folders || []) {
      const li = document.createElement('li');
      const size = document.createElement('span');
      size.className = 'largest-size';
      size.textContent = formatBytes(f.size);
      const name = document.createElement('span');
      name.className = 'largest-name';
      name.textContent = `${f.folder} (${formatCount(f.count)} files)`;
      name.title = f.folder;
      li.append(size, name);
      this.foldersList.appendChild(li);
    }

    if ((files && files.length) || (folders && folders.length)) {
      this.show();
    }
  }
}
