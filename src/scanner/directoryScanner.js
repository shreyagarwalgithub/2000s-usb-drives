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
 * Folder intelligence: when the walk enters a folder recognized by the folder
 * dictionary (see folderIntelligence.js), the whole subtree is marked as
 * belonging to that folder, and only ~5% of its files are flagged for full
 * classification. Each file entry carries this context so the caller can decide
 * how much work to do per file.
 *
 * @typedef {Object} FileEntry
 * @property {string} name           File name (last path segment).
 * @property {string} path           Full relative path from the scan root.
 * @property {number} size           Size in bytes.
 * @property {() => Promise<File>} getFile  Lazily resolves the File object.
 * @property {import('./folderIntelligence.js').FolderPattern|null} folder
 *           The recognized folder this file belongs to, or null.
 * @property {boolean} sampled       For recognized folders: whether this file
 *           was picked as part of the ~5% sample. Always true when folder is
 *           null (i.e. normal, unrecognized files are all classified).
 */

import { recognizeFolder, shouldSample } from './folderIntelligence.js';

/** Directory names we skip entirely: system/metadata clutter on old drives. */
const SKIP_DIRS = new Set([
  '$RECYCLE.BIN',
  'System Volume Information',
  '.Trashes',
  '.Spotlight-V100',
  '.fseventsd',
  '.git',
]);

/**
 * Recursively yield file entries from a directory handle.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} [prefix] Accumulated path prefix.
 * @param {import('./folderIntelligence.js').FolderPattern|null} [inheritedFolder]
 *        A recognized folder inherited from an ancestor, if any. Once a folder
 *        is recognized, its whole subtree inherits the recognition.
 * @param {{ n: number }} [sampleCounter]
 *        Shared per-recognized-folder file counter used to sample ~5%.
 * @returns {AsyncGenerator<FileEntry>}
 */
export async function* walkDirectoryHandle(
  dirHandle,
  prefix = '',
  inheritedFolder = null,
  sampleCounter = null
) {
  for await (const [name, handle] of dirHandle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'directory') {
      if (SKIP_DIRS.has(name)) continue;

      // If we're not already inside a recognized folder, see if this one is.
      // The recognized folder (and a fresh sample counter) is inherited by the
      // entire subtree beneath it.
      let folder = inheritedFolder;
      let counter = sampleCounter;
      if (!folder) {
        const recognized = recognizeFolder(path);
        if (recognized) {
          folder = recognized;
          counter = { n: 0 };
        }
      }

      yield* walkDirectoryHandle(handle, path, folder, counter);
    } else {
      // Decide sampling for files inside a recognized folder.
      let sampled = true;
      if (inheritedFolder && sampleCounter) {
        sampled = shouldSample(sampleCounter.n);
        sampleCounter.n += 1;
      }

      yield {
        name,
        path,
        size: -1,
        getFile: () => handle.getFile(),
        folder: inheritedFolder,
        sampled,
      };
    }
  }
}

/**
 * Yield file entries from a flat webkitdirectory file list.
 *
 * Recognition here works on each file's parent-folder path. Files sharing the
 * same recognized folder root share a sample counter, keyed by that root path,
 * so ~5% are flagged for classification. This assumes the input list groups
 * files by folder, which browsers do in practice.
 *
 * @param {Array<{ file: File, path: string }>} items
 * @returns {AsyncGenerator<FileEntry>}
 */
export async function* walkInputFiles(items) {
  /** @type {Map<string, { n: number }>} */
  const counters = new Map();

  for (const { file, path } of items) {
    const segments = path.split('/');
    if (segments.some((seg) => SKIP_DIRS.has(seg))) continue;

    const parentPath = segments.slice(0, -1).join('/');
    const folder = recognizeFolder(parentPath);

    let sampled = true;
    if (folder) {
      // Key the counter by the matched folder id + parent path so distinct
      // recognized folders sample independently.
      const key = `${folder.id}:${parentPath}`;
      let counter = counters.get(key);
      if (!counter) {
        counter = { n: 0 };
        counters.set(key, counter);
      }
      sampled = shouldSample(counter.n);
      counter.n += 1;
    }

    yield {
      name: file.name,
      path,
      size: file.size,
      getFile: async () => file,
      folder,
      sampled,
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
