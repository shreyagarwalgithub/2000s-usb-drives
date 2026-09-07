import { ContentType, Confidence } from '../types.js';

/**
 * Maps a file extension (without the dot, lowercased) to a content type and a
 * best-guess MIME type. This is the fast path: it needs only the file name, so
 * it costs nothing to run across a huge drive.
 *
 * The map is intentionally broad and biased toward content that shows up on
 * old 2000s-era drives.
 */
const EXTENSION_MAP = {
  // ---- Video ----
  mp4: [ContentType.VIDEO, 'video/mp4'],
  m4v: [ContentType.VIDEO, 'video/x-m4v'],
  mov: [ContentType.VIDEO, 'video/quicktime'],
  avi: [ContentType.VIDEO, 'video/x-msvideo'],
  wmv: [ContentType.VIDEO, 'video/x-ms-wmv'],
  flv: [ContentType.VIDEO, 'video/x-flv'],
  mkv: [ContentType.VIDEO, 'video/x-matroska'],
  webm: [ContentType.VIDEO, 'video/webm'],
  mpg: [ContentType.VIDEO, 'video/mpeg'],
  mpeg: [ContentType.VIDEO, 'video/mpeg'],
  '3gp': [ContentType.VIDEO, 'video/3gpp'],
  vob: [ContentType.VIDEO, 'video/dvd'],
  rm: [ContentType.VIDEO, 'application/vnd.rn-realmedia'],
  rmvb: [ContentType.VIDEO, 'application/vnd.rn-realmedia-vbr'],
  divx: [ContentType.VIDEO, 'video/divx'],
  ts: [ContentType.VIDEO, 'video/mp2t'],

  // ---- Image ----
  jpg: [ContentType.IMAGE, 'image/jpeg'],
  jpeg: [ContentType.IMAGE, 'image/jpeg'],
  png: [ContentType.IMAGE, 'image/png'],
  gif: [ContentType.IMAGE, 'image/gif'],
  bmp: [ContentType.IMAGE, 'image/bmp'],
  tif: [ContentType.IMAGE, 'image/tiff'],
  tiff: [ContentType.IMAGE, 'image/tiff'],
  webp: [ContentType.IMAGE, 'image/webp'],
  heic: [ContentType.IMAGE, 'image/heic'],
  heif: [ContentType.IMAGE, 'image/heif'],
  svg: [ContentType.IMAGE, 'image/svg+xml'],
  ico: [ContentType.IMAGE, 'image/x-icon'],
  raw: [ContentType.IMAGE, 'image/x-raw'],
  cr2: [ContentType.IMAGE, 'image/x-canon-cr2'],
  nef: [ContentType.IMAGE, 'image/x-nikon-nef'],
  psd: [ContentType.IMAGE, 'image/vnd.adobe.photoshop'],

  // ---- Audio ----
  mp3: [ContentType.AUDIO, 'audio/mpeg'],
  wav: [ContentType.AUDIO, 'audio/wav'],
  flac: [ContentType.AUDIO, 'audio/flac'],
  aac: [ContentType.AUDIO, 'audio/aac'],
  ogg: [ContentType.AUDIO, 'audio/ogg'],
  oga: [ContentType.AUDIO, 'audio/ogg'],
  wma: [ContentType.AUDIO, 'audio/x-ms-wma'],
  m4a: [ContentType.AUDIO, 'audio/mp4'],
  aiff: [ContentType.AUDIO, 'audio/aiff'],
  mid: [ContentType.AUDIO, 'audio/midi'],
  midi: [ContentType.AUDIO, 'audio/midi'],
  amr: [ContentType.AUDIO, 'audio/amr'],

  // ---- Code ----
  js: [ContentType.CODE, 'text/javascript'],
  mjs: [ContentType.CODE, 'text/javascript'],
  ts: undefined, // handled below to avoid collision with video "ts"
  jsx: [ContentType.CODE, 'text/jsx'],
  tsx: [ContentType.CODE, 'text/tsx'],
  py: [ContentType.CODE, 'text/x-python'],
  java: [ContentType.CODE, 'text/x-java-source'],
  c: [ContentType.CODE, 'text/x-c'],
  h: [ContentType.CODE, 'text/x-c'],
  cpp: [ContentType.CODE, 'text/x-c++'],
  cc: [ContentType.CODE, 'text/x-c++'],
  hpp: [ContentType.CODE, 'text/x-c++'],
  cs: [ContentType.CODE, 'text/x-csharp'],
  go: [ContentType.CODE, 'text/x-go'],
  rb: [ContentType.CODE, 'text/x-ruby'],
  php: [ContentType.CODE, 'application/x-httpd-php'],
  swift: [ContentType.CODE, 'text/x-swift'],
  kt: [ContentType.CODE, 'text/x-kotlin'],
  rs: [ContentType.CODE, 'text/x-rust'],
  sh: [ContentType.CODE, 'application/x-sh'],
  bat: [ContentType.CODE, 'application/x-bat'],
  pl: [ContentType.CODE, 'text/x-perl'],
  sql: [ContentType.CODE, 'application/sql'],
  html: [ContentType.CODE, 'text/html'],
  htm: [ContentType.CODE, 'text/html'],
  css: [ContentType.CODE, 'text/css'],
  json: [ContentType.CODE, 'application/json'],
  xml: [ContentType.CODE, 'application/xml'],
  yaml: [ContentType.CODE, 'application/x-yaml'],
  yml: [ContentType.CODE, 'application/x-yaml'],
  ipynb: [ContentType.CODE, 'application/x-ipynb+json'],

  // ---- Document ----
  pdf: [ContentType.DOCUMENT, 'application/pdf'],
  doc: [ContentType.DOCUMENT, 'application/msword'],
  docx: [
    ContentType.DOCUMENT,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  xls: [ContentType.DOCUMENT, 'application/vnd.ms-excel'],
  xlsx: [
    ContentType.DOCUMENT,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  ppt: [ContentType.DOCUMENT, 'application/vnd.ms-powerpoint'],
  pptx: [
    ContentType.DOCUMENT,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  odt: [ContentType.DOCUMENT, 'application/vnd.oasis.opendocument.text'],
  ods: [ContentType.DOCUMENT, 'application/vnd.oasis.opendocument.spreadsheet'],
  rtf: [ContentType.DOCUMENT, 'application/rtf'],
  txt: [ContentType.DOCUMENT, 'text/plain'],
  md: [ContentType.DOCUMENT, 'text/markdown'],
  epub: [ContentType.DOCUMENT, 'application/epub+zip'],
  mobi: [ContentType.DOCUMENT, 'application/x-mobipocket-ebook'],
  pages: [ContentType.DOCUMENT, 'application/x-iwork-pages-sffpages'],

  // ---- Archive ----
  zip: [ContentType.ARCHIVE, 'application/zip'],
  rar: [ContentType.ARCHIVE, 'application/vnd.rar'],
  '7z': [ContentType.ARCHIVE, 'application/x-7z-compressed'],
  tar: [ContentType.ARCHIVE, 'application/x-tar'],
  gz: [ContentType.ARCHIVE, 'application/gzip'],
  bz2: [ContentType.ARCHIVE, 'application/x-bzip2'],
  xz: [ContentType.ARCHIVE, 'application/x-xz'],
  cab: [ContentType.ARCHIVE, 'application/vnd.ms-cab-compressed'],

  // ---- Executable ----
  exe: [ContentType.EXECUTABLE, 'application/x-msdownload'],
  msi: [ContentType.EXECUTABLE, 'application/x-msi'],
  dmg: [ContentType.EXECUTABLE, 'application/x-apple-diskimage'],
  app: [ContentType.EXECUTABLE, 'application/octet-stream'],
  apk: [ContentType.EXECUTABLE, 'application/vnd.android.package-archive'],
  deb: [ContentType.EXECUTABLE, 'application/vnd.debian.binary-package'],
  rpm: [ContentType.EXECUTABLE, 'application/x-rpm'],

  // ---- Disk image ----
  iso: [ContentType.DISK_IMAGE, 'application/x-iso9660-image'],
  img: [ContentType.DISK_IMAGE, 'application/octet-stream'],
  bin: [ContentType.DISK_IMAGE, 'application/octet-stream'],
  cue: [ContentType.DISK_IMAGE, 'application/octet-stream'],

  // ---- Font ----
  ttf: [ContentType.FONT, 'font/ttf'],
  otf: [ContentType.FONT, 'font/otf'],
  woff: [ContentType.FONT, 'font/woff'],
  woff2: [ContentType.FONT, 'font/woff2'],

  // ---- Data ----
  csv: [ContentType.DATA, 'text/csv'],
  tsv: [ContentType.DATA, 'text/tab-separated-values'],
  db: [ContentType.DATA, 'application/x-sqlite3'],
  sqlite: [ContentType.DATA, 'application/x-sqlite3'],
  log: [ContentType.DATA, 'text/plain'],
};

// ".ts" is ambiguous: TypeScript source vs. MPEG transport stream. On 2000s
// drives it is overwhelmingly video, but we let the magic-number engine settle
// it when file bytes are available. Default the extension guess to CODE only
// when nothing else decides, since a lone ".ts" today usually means TypeScript.
EXTENSION_MAP.ts = [ContentType.CODE, 'text/typescript'];

/**
 * Extract the lowercased extension from a file name, or '' if none.
 * @param {string} name
 * @returns {string}
 */
export function getExtension(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Classify a file by its extension alone.
 * @param {string} name File name.
 * @returns {import('../types.js').ClassificationResult}
 */
export function classifyByExtension(name) {
  const ext = getExtension(name);
  const entry = ext ? EXTENSION_MAP[ext] : undefined;
  if (entry) {
    return { type: entry[0], detectedBy: Confidence.EXTENSION, mime: entry[1] };
  }
  return { type: ContentType.UNKNOWN, detectedBy: Confidence.NONE, mime: undefined };
}
