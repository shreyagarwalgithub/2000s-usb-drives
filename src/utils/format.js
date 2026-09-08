/**
 * Format a byte count into a human-readable string (e.g. "1.4 GB").
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  const rounded = value >= 100 || exponent === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[exponent]}`;
}

/**
 * Format an integer with thousands separators.
 * @param {number} n
 * @returns {string}
 */
export function formatCount(n) {
  return new Intl.NumberFormat().format(n);
}

/**
 * Format a part/whole ratio as a percentage string (e.g. "12.3%").
 * Returns "0%" when the whole is zero to avoid division by zero.
 * @param {number} part
 * @param {number} whole
 * @returns {string}
 */
export function formatPercent(part, whole) {
  if (!Number.isFinite(whole) || whole <= 0) return '0%';
  const pct = (part / whole) * 100;
  // Show one decimal for small shares, whole numbers once it's sizable.
  const rounded = pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${rounded}%`;
}
