/**
 * Disk-usage size tree, in the spirit of the Linux tool ncdu.
 *
 * ncdu scans a directory tree once and gives you an interactive, navigable map
 * sorted by size — biggest first — where every directory shows its *total
 * recursive* size (everything inside it, at every depth), and you can drill
 * down into subdirectories and back up to the parent. (Behavior described from
 * public documentation; content rephrased for licensing compliance.)
 *
 * This module builds the same kind of tree from the flat per-file records we
 * already collect during a scan, so it costs no extra scanning. The UI layer
 * (ui/treeBrowser.js) renders it interactively.
 *
 * @typedef {Object} TreeNode
 * @property {string} name        Segment name (folder or file name).
 * @property {string} path        Full path from the scan root.
 * @property {boolean} isDir       Whether this node is a directory.
 * @property {number} size         Total recursive size in bytes (dirs) or file
 *                                 size (files).
 * @property {number} fileCount    Number of files at or below this node.
 * @property {string} [type]       Content type (files only).
 * @property {Map<string, TreeNode>} [children] Child nodes (dirs only).
 */

/**
 * Build a size tree from flat file records.
 *
 * Each record has a `path` (e.g. "Drive/a/b/file.txt") and a `size`. We split
 * on "/", create directory nodes as needed, attach the file as a leaf, and add
 * its size to every ancestor so each directory carries its recursive total.
 *
 * @param {Array<{ path: string, size: number, type?: string }>} fileRecords
 * @returns {TreeNode} The root node (a synthetic directory containing everything).
 */
export function buildSizeTree(fileRecords) {
  /** @type {TreeNode} */
  const root = {
    name: '',
    path: '',
    isDir: true,
    size: 0,
    fileCount: 0,
    children: new Map(),
  };

  for (const rec of fileRecords || []) {
    const size = Number.isFinite(rec.size) && rec.size > 0 ? rec.size : 0;
    const segments = rec.path.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    let node = root;
    // Walk/create directory nodes for every segment except the last (the file).
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const childPath = node.path ? `${node.path}/${seg}` : seg;
      let child = node.children.get(seg);
      if (!child) {
        child = {
          name: seg,
          path: childPath,
          isDir: true,
          size: 0,
          fileCount: 0,
          children: new Map(),
        };
        node.children.set(seg, child);
      }
      node = child;
    }

    // Attach the file leaf.
    const fileName = segments[segments.length - 1];
    const filePath = node.path ? `${node.path}/${fileName}` : fileName;
    node.children.set(fileName, {
      name: fileName,
      path: filePath,
      isDir: false,
      size,
      fileCount: 1,
      type: rec.type,
    });

    // Propagate size + count to every ancestor, including root.
    let anc = root;
    anc.size += size;
    anc.fileCount += 1;
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      cursor = cursor.children.get(segments[i]);
      cursor.size += size;
      cursor.fileCount += 1;
    }
  }

  return collapseSingleRoot(root);
}

/**
 * If the tree has exactly one top-level directory (the common case — everything
 * lives under the scanned folder), return that directory as the effective root
 * so the browser opens directly inside it rather than at an empty wrapper.
 * @param {TreeNode} root
 * @returns {TreeNode}
 */
function collapseSingleRoot(root) {
  if (root.children.size === 1) {
    const [only] = root.children.values();
    if (only.isDir) return only;
  }
  return root;
}

/**
 * Return a node's children as an array sorted by descending size (dirs and
 * files interleaved, biggest first — like ncdu).
 * @param {TreeNode} node
 * @returns {TreeNode[]}
 */
export function sortedChildren(node) {
  if (!node || !node.isDir || !node.children) return [];
  return [...node.children.values()].sort((a, b) => b.size - a.size);
}

/**
 * Find a node by its full path, starting from a given root. Returns null if the
 * path doesn't resolve.
 * @param {TreeNode} root
 * @param {string} path
 * @returns {TreeNode|null}
 */
export function findNode(root, path) {
  if (!root) return null;
  if (path === root.path) return root;
  if (!path.startsWith(root.path)) return null;

  const rest = root.path ? path.slice(root.path.length + 1) : path;
  const segments = rest.split('/').filter(Boolean);
  let node = root;
  for (const seg of segments) {
    if (!node.children) return null;
    const next = node.children.get(seg);
    if (!next) return null;
    node = next;
  }
  return node;
}
