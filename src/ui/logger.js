/**
 * On-page log panel. Records scan events with a timestamp and a severity level
 * so the user can see what the app is doing without opening dev tools.
 *
 * Writes are batched with requestAnimationFrame, and the on-screen history is
 * capped so a very long scan can't grow the DOM without bound.
 */

/** Maximum number of log lines kept in the DOM at once. */
const MAX_LINES = 500;

export class Logger {
  constructor() {
    this.section = document.getElementById('log-section');
    this.output = document.getElementById('log-output');
    this.clearBtn = document.getElementById('clear-logs');
    /** @type {Array<{ level: string, message: string, time: string }>} */
    this._buffer = [];
    this._pending = false;

    this.clearBtn.addEventListener('click', () => this.clear());
  }

  show() {
    this.section.hidden = false;
  }

  /** @param {string} message */
  info(message) {
    this._push('info', message);
  }

  /** @param {string} message */
  success(message) {
    this._push('success', message);
  }

  /** @param {string} message */
  warn(message) {
    this._push('warn', message);
  }

  /** @param {string} message */
  error(message) {
    this._push('error', message);
  }

  clear() {
    this._buffer = [];
    this.output.innerHTML = '';
  }

  /**
   * @param {string} level 'info' | 'success' | 'warn' | 'error'
   * @param {string} message
   */
  _push(level, message) {
    const time = new Date().toLocaleTimeString();
    this._buffer.push({ level, message, time });
    this._scheduleFlush();
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
    const frag = document.createDocumentFragment();
    for (const { level, message, time } of this._buffer) {
      const line = document.createElement('div');
      line.className = `log-line log-${level}`;

      const ts = document.createElement('span');
      ts.className = 'log-time';
      ts.textContent = time;

      const msg = document.createElement('span');
      msg.className = 'log-message';
      msg.textContent = message;

      line.append(ts, msg);
      frag.appendChild(line);
    }
    this._buffer = [];
    this.output.appendChild(frag);

    // Cap the number of lines in the DOM.
    while (this.output.children.length > MAX_LINES) {
      this.output.removeChild(this.output.firstChild);
    }

    // Keep the newest line in view.
    this.output.scrollTop = this.output.scrollHeight;
  }
}
