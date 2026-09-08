/**
 * Recursively walk a selected source and yield file entries one at a time.
 *
 * Two sources are supported, matching the two file-picking strategies:
 *   1. A FileSystemDirectoryHandle (File System Access API).
 *   2. A flat list of { file, path } objects (webkitdirectory fallback).
 *
 * Both are exposed as async generators so the caller can stream results and
 * keep memory flat even on very large drives.
 *
 * @typedef {Object} FileEntry
 * @property {string} name           File name (last path segment).
 * @property {string} path           Full relative path from the scan root.
 * @property {number} size           Size in bytes.
 * @property {() => Promise<File>} getFile  Lazily resolves the File object.
 */

/** Directory names we skip: system/metadata clutter common on old drives. */
const SKIP_DIRS = new Set([
  '$RECYCLE.BIN',
  'System Volume Information',
  '.Trashes',
  '.Spotlight-V100',
  '.fseventsd',
  '.git',
  'node_modules',
]);

/**
 * Recursively yield file entries from a directory handle.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} [prefix] Accumulated path prefix.
 * @returns {AsyncGenerator<FileEntry>}
 */
export async function* walkDirectoryHandle(dirHandle, prefix = '') {
  for await (const [name, handle] of dirHandle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      if (SKIP_DIRS.has(name)) continue;
      yield* walkDirectoryHandle(handle, path);
    } else {
      // Resolve size lazily-ish: we need the File for size, but reading a
      // File object header is cheap and doesn't load the whole file.
      yield {
        name,
        path,
        // Size is filled in by the consumer when it fetches the File, but we
        // provide a getter that also carries size once resolved.
        size: -1,
        getFile: () => handle.getFile(),
      };
    }
  }
}

/**
 * Yield file entries from a flat webkitdirectory file list.
 * @param {Array<{ file: File, path: string }>} items
 * @returns {AsyncGenerator<FileEntry>}
 */
export async function* walkInputFiles(items) {
  for (const { file, path } of items) {
    const segments = path.split('/');
    if (segments.some((seg) => SKIP_DIRS.has(seg))) continue;
    yield {
      name: file.name,
      path,
      size: file.size,
      getFile: async () => file,
    };
  }
}

/**
 * Build the appropriate async generator for a given source.
 * @param {Object} source
 * @param {FileSystemDirectoryHandle} [source.dirHandle]
 * @param {Array<{ file: File, path: string }>} [source.inputItems]
 * @returns {AsyncGenerator<FileEntry>}
 */
export function scan(source) {
  if (source.dirHandle) {
    return walkDirectoryHandle(source.dirHandle, source.dirHandle.name || '');
  }
  if (source.inputItems) {
    return walkInputFiles(source.inputItems);
  }
  throw new Error('scan() requires a dirHandle or inputItems source');
}

/**
 * Count the files a scan would yield, without reading any file contents.
 *
 * This walks the same generator as scan(), so the total matches what the
 * classification pass will actually process. It is a name-only traversal, so
 * it is cheap even on very large drives. For the webkitdirectory fallback the
 * list is already in memory, so counting is effectively instant.
 *
 * @param {Object} source Either { dirHandle } or { inputItems }.
 * @param {() => boolean} [shouldStop] Return true to abort counting early.
 * @returns {Promise<number>}
 */
export async function countFiles(source, shouldStop) {
  let total = 0;
  for await (const _entry of scan(source)) {
    if (shouldStop && shouldStop()) break;
    total += 1;
  }
  return total;
}
