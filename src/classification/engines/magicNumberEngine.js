import { ContentType, Confidence } from '../types.js';

/**
 * Magic-number (file signature) detection.
 *
 * We read only the first handful of bytes of a file and match them against
 * known signatures. This is far more reliable than the extension because it
 * looks at what the file actually is, and it works even when the extension is
 * missing, wrong, or unusual.
 *
 * Signatures are checked against a small header buffer. Some formats need an
 * offset (e.g. ISO images, some MP4 boxes), which is expressed per signature.
 */

/** Number of header bytes we read per file. Enough for every signature below. */
export const HEADER_BYTES = 64;

/**
 * @typedef {Object} Signature
 * @property {number[]} bytes   Byte values to match (use -1 as a wildcard).
 * @property {number} [offset]  Offset into the header where matching starts.
 * @property {string} type      ContentType to assign on match.
 * @property {string} [mime]    MIME type to assign on match.
 */

/** @type {Signature[]} */
const SIGNATURES = [
  // ---- Images ----
  { bytes: [0xff, 0xd8, 0xff], type: ContentType.IMAGE, mime: 'image/jpeg' },
  {
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    type: ContentType.IMAGE,
    mime: 'image/png',
  },
  { bytes: [0x47, 0x49, 0x46, 0x38], type: ContentType.IMAGE, mime: 'image/gif' }, // GIF8
  { bytes: [0x42, 0x4d], type: ContentType.IMAGE, mime: 'image/bmp' }, // BM
  { bytes: [0x49, 0x49, 0x2a, 0x00], type: ContentType.IMAGE, mime: 'image/tiff' }, // little-endian TIFF
  { bytes: [0x4d, 0x4d, 0x00, 0x2a], type: ContentType.IMAGE, mime: 'image/tiff' }, // big-endian TIFF
  { bytes: [0x38, 0x42, 0x50, 0x53], type: ContentType.IMAGE, mime: 'image/vnd.adobe.photoshop' }, // 8BPS (PSD)

  // ---- Audio ----
  { bytes: [0x49, 0x44, 0x33], type: ContentType.AUDIO, mime: 'audio/mpeg' }, // ID3 (MP3)
  { bytes: [0xff, 0xfb], type: ContentType.AUDIO, mime: 'audio/mpeg' }, // MP3 frame
  { bytes: [0xff, 0xf3], type: ContentType.AUDIO, mime: 'audio/mpeg' },
  { bytes: [0xff, 0xf2], type: ContentType.AUDIO, mime: 'audio/mpeg' },
  { bytes: [0x66, 0x4c, 0x61, 0x43], type: ContentType.AUDIO, mime: 'audio/flac' }, // fLaC
  { bytes: [0x4f, 0x67, 0x67, 0x53], type: ContentType.AUDIO, mime: 'audio/ogg' }, // OggS

  // ---- Video ----
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], type: ContentType.VIDEO, mime: 'video/x-matroska' }, // MKV/WebM (EBML)
  { bytes: [0x46, 0x4c, 0x56], type: ContentType.VIDEO, mime: 'video/x-flv' }, // FLV
  { bytes: [0x00, 0x00, 0x01, 0xba], type: ContentType.VIDEO, mime: 'video/mpeg' }, // MPEG-PS
  { bytes: [0x00, 0x00, 0x01, 0xb3], type: ContentType.VIDEO, mime: 'video/mpeg' }, // MPEG video
  // MP4/MOV/3GP: "ftyp" box at offset 4.
  { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4, type: ContentType.VIDEO, mime: 'video/mp4' },

  // ---- Archives ----
  // ZIP (also used by docx/xlsx/pptx/epub/jar). We report ARCHIVE; the
  // classifier prefers the extension guess when it is a known ZIP-based format.
  { bytes: [0x50, 0x4b, 0x03, 0x04], type: ContentType.ARCHIVE, mime: 'application/zip' },
  { bytes: [0x50, 0x4b, 0x05, 0x06], type: ContentType.ARCHIVE, mime: 'application/zip' },
  { bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], type: ContentType.ARCHIVE, mime: 'application/vnd.rar' }, // Rar!
  { bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], type: ContentType.ARCHIVE, mime: 'application/x-7z-compressed' },
  { bytes: [0x1f, 0x8b], type: ContentType.ARCHIVE, mime: 'application/gzip' }, // gzip
  { bytes: [0x42, 0x5a, 0x68], type: ContentType.ARCHIVE, mime: 'application/x-bzip2' }, // BZh

  // ---- Documents ----
  { bytes: [0x25, 0x50, 0x44, 0x46], type: ContentType.DOCUMENT, mime: 'application/pdf' }, // %PDF
  // Legacy MS Office (doc/xls/ppt) OLE compound file.
  {
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    type: ContentType.DOCUMENT,
    mime: 'application/x-ole-storage',
  },

  // ---- Executables ----
  { bytes: [0x4d, 0x5a], type: ContentType.EXECUTABLE, mime: 'application/x-msdownload' }, // MZ (PE/EXE)
  { bytes: [0x7f, 0x45, 0x4c, 0x46], type: ContentType.EXECUTABLE, mime: 'application/x-executable' }, // ELF
  { bytes: [0xca, 0xfe, 0xba, 0xbe], type: ContentType.EXECUTABLE, mime: 'application/x-mach-binary' }, // Mach-O fat

  // ---- Fonts ----
  { bytes: [0x00, 0x01, 0x00, 0x00, 0x00], type: ContentType.FONT, mime: 'font/ttf' },
  { bytes: [0x4f, 0x54, 0x54, 0x4f], type: ContentType.FONT, mime: 'font/otf' }, // OTTO
  { bytes: [0x77, 0x4f, 0x46, 0x46], type: ContentType.FONT, mime: 'font/woff' }, // wOFF
  { bytes: [0x77, 0x4f, 0x46, 0x32], type: ContentType.FONT, mime: 'font/woff2' }, // wOF2

  // ---- Data ----
  { bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66], type: ContentType.DATA, mime: 'application/x-sqlite3' }, // "SQLite f"
];

/**
 * Test whether a signature matches the given header bytes.
 * @param {Uint8Array} header
 * @param {Signature} sig
 * @returns {boolean}
 */
function matches(header, sig) {
  const offset = sig.offset ?? 0;
  if (offset + sig.bytes.length > header.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    const expected = sig.bytes[i];
    if (expected === -1) continue; // wildcard
    if (header[offset + i] !== expected) return false;
  }
  return true;
}

/**
 * Classify by inspecting the file header bytes.
 * @param {Uint8Array} header First HEADER_BYTES of the file.
 * @returns {import('../types.js').ClassificationResult | null}
 *          A result if a signature matched, otherwise null.
 */
export function classifyByMagic(header) {
  if (!header || header.length === 0) return null;
  for (const sig of SIGNATURES) {
    if (matches(header, sig)) {
      return { type: sig.type, detectedBy: Confidence.MAGIC, mime: sig.mime };
    }
  }
  return null;
}

/**
 * Read the first HEADER_BYTES of a File/Blob as a Uint8Array.
 * Reads only a small slice, so it is cheap even for multi-GB files.
 * @param {File|Blob} file
 * @returns {Promise<Uint8Array>}
 */
export async function readHeader(file) {
  const slice = file.slice(0, HEADER_BYTES);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}
