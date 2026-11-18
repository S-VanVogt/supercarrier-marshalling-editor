/**
 * package-builder.js — builds an install package (zip) for a config, in the
 * browser, with no library.
 *
 * Layout = Open Mod Manager "Mod Pack", the same one the SC-Config toolkit and
 * the dcs-mod-package script produce (checked against OMM's OmModPack.cpp):
 *
 *   modpack.xml
 *   readme.md
 *   <package name>/CoreMods/tech/USS_Nimitz/scripts/<config files>
 *
 * It installs with Open Mod Manager, or by hand: the <package name> folder
 * mirrors the DCS install folder. Only game files go inside that folder.
 *
 * Entries are stored uncompressed — a whole config is about 400 KB of text.
 */
import { DCS_SCRIPTS_PATH } from './default-config.js';

const OMM_CATEGORY = 'SuperCarrier';
const OMM_LINK = 'https://github.com/iquercorb/OpenModMan';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (zip polynomial) of a byte array. */
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build a zip archive with stored (uncompressed) entries.
 * @param {{path: string, bytes: Uint8Array}[]} entries  paths use '/', ASCII only
 * @param {Date} [date] timestamp given to every entry
 * @returns {Uint8Array}
 */
export function buildZip(entries, date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const encoder = new TextEncoder();

  const chunks = [];        // local headers + file data, in order
  const directory = [];     // central directory records
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const size = entry.bytes.length;
    const crc = crc32(entry.bytes);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);   // local file header signature
    local.setUint16(4, 20, true);           // version needed to extract
    local.setUint16(6, 0, true);            // flags
    local.setUint16(8, 0, true);            // method 0 = stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);        // compressed size
    local.setUint32(22, size, true);        // uncompressed size
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);           // extra field length
    chunks.push(new Uint8Array(local.buffer), name, entry.bytes);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);  // central directory signature
    record.setUint16(4, 20, true);          // version made by
    record.setUint16(6, 20, true);          // version needed to extract
    record.setUint16(8, 0, true);           // flags
    record.setUint16(10, 0, true);          // method 0 = stored
    record.setUint16(12, dosTime, true);
    record.setUint16(14, dosDate, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, size, true);
    record.setUint32(24, size, true);
    record.setUint16(28, name.length, true);
    record.setUint16(30, 0, true);          // extra field length
    record.setUint16(32, 0, true);          // comment length
    record.setUint16(34, 0, true);          // disk number
    record.setUint16(36, 0, true);          // internal attributes
    record.setUint32(38, 0, true);          // external attributes
    record.setUint32(42, offset, true);     // offset of the local header
    directory.push(new Uint8Array(record.buffer), name);

    offset += 30 + name.length + size;
  }

  const directorySize = directory.reduce((n, part) => n + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);       // end of central directory signature
  end.setUint16(4, 0, true);                // this disk
  end.setUint16(6, 0, true);                // disk with the directory
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);          // directory starts after the last entry
  end.setUint16(20, 0, true);               // comment length

  const parts = [...chunks, ...directory, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let pos = 0;
  for (const part of parts) { out.set(part, pos); pos += part.length; }
  return out;
}

/** Escape &, <, > for XML element text (what OMM itself writes). */
function xmlText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Keep a name usable as a folder and file name. */
function safeName(s) {
  return String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** OMM readme file list: every directory level and each file, backslash paths, sorted. */
function dirFileList(arcPaths) {
  const seen = new Set();
  for (const arcPath of arcPaths) {
    let acc = '';
    for (const part of arcPath.split('/')) {
      acc = acc ? acc + '\\' + part : part;
      seen.add(acc);
    }
  }
  return [...seen].sort().map(e => ' - ' + e).join('\n');
}

/**
 * Build the install package for a config.
 * @param {object} opts
 * @param {string} opts.configName  config name, e.g. "MyConfig"
 * @param {string} opts.version     version from the stamp, e.g. "v0.3"
 * @param {{name: string, text: string}[]} opts.files  config files to include
 * @param {string} [opts.description]
 * @returns {{fileName: string, packageName: string, bytes: Uint8Array}}
 */
export function buildOmmPackage({ configName, version, files, description }) {
  if (!files || files.length === 0) throw new Error('no files to package');
  // Same naming as the SC-Config toolkit, without its author prefix
  const packageName = `SC-${safeName(configName)}_${safeName(version || 'v0.0')}`;
  const desc = description ||
    `SuperCarrier deck crew and route configuration "${configName}" ${version || ''}`.trim() +
    ', made with the SuperCarrier Marshalling Editor.';

  const encoder = new TextEncoder();
  const arcPaths = files.map(f => `${DCS_SCRIPTS_PATH}/${f.name}`);

  const modpack = [
    '<Open_Mod_Manager_Package>',
    `\t<install>${xmlText(packageName)}</install>`,
    `\t<category>${xmlText(OMM_CATEGORY)}</category>`,
    `\t<description>${xmlText(desc)}</description>`,
    '</Open_Mod_Manager_Package>',
  ].join('\n') + '\n';

  const readme = [
    `# Mod Pack for "${packageName}"`, '',
    desc, '',
    'This file was created using Open Mod Manager and is intended to be installed using',
    'Open Mod Manager or any compatible software.', '',
    '# Manual installation', '',
    'If you want to install this Mod manually, you can find Mod files into',
    `the "${packageName}" subdirectory`, 'of this archive.',
    'Its content is respecting the target application/game tree and here is the list of',
    'files to be copied :', '', dirFileList(arcPaths), '',
    'Once you made a backup of the original files, you can install Mod by extracting',
    'files to the proper target application/game directory, overwriting original files.', '',
    '# About Open Mod Manager', '',
    'For more information about Open Mod Manager and Mod Pack, please visit :', '',
    `   ${OMM_LINK}`,
  ].join('\n') + '\n';

  const entries = [
    { path: 'modpack.xml', bytes: encoder.encode(modpack) },
    { path: 'readme.md', bytes: encoder.encode(readme) },
    ...files.map((f, i) => ({ path: `${packageName}/${arcPaths[i]}`, bytes: encoder.encode(f.text) })),
  ];
  return { fileName: `${packageName}.zip`, packageName, bytes: buildZip(entries) };
}

/** Hand a byte array to the browser as a file download. */
export function downloadBytes(bytes, fileName, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
