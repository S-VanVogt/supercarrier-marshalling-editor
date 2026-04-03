/**
 * config-store.js — File System Access API wrapper for SC-Configs folder persistence.
 *
 * Stores the directory handle in IndexedDB so it survives page reloads.
 * On restore, re-requests read/write permission (browser will prompt once per session).
 */

const DB_NAME = 'sc-config-store';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const KEY_ROOT = 'sc-configs-root';
const LS_LAST_CONFIG = 'sc-config-last';

// ── IndexedDB helpers ──────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Public API ─────────────────────────────────────────────────────────

/** Currently held root directory handle (SC-Configs folder). */
let _rootHandle = null;

/** Currently selected config subfolder handle. */
let _activeConfigHandle = null;
let _activeConfigName = null;

/**
 * Prompt user to pick the SC-Configs root folder.
 * Stores handle in IndexedDB for future sessions.
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function pickRootFolder() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  _rootHandle = handle;
  await idbPut(KEY_ROOT, handle);
  return handle;
}

/**
 * Try to restore a previously saved root folder handle.
 * Returns null if none saved or permission denied.
 * @param {boolean} requestPermission - if true, prompt user for permission
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function restoreRootFolder(requestPermission = false) {
  try {
    const handle = await idbGet(KEY_ROOT);
    if (!handle) return null;
    // Check/request permission
    const mode = 'readwrite';
    let perm = await handle.queryPermission({ mode });
    if (perm === 'granted') {
      _rootHandle = handle;
      return handle;
    }
    if (requestPermission && perm === 'prompt') {
      perm = await handle.requestPermission({ mode });
      if (perm === 'granted') {
        _rootHandle = handle;
        return handle;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * List config subfolders in the root directory.
 * Only includes folders that contain at least one .lua file.
 * @returns {Promise<string[]>} sorted folder names
 */
export async function listConfigs() {
  if (!_rootHandle) return [];
  const names = [];
  for await (const [name, handle] of _rootHandle.entries()) {
    if (handle.kind !== 'directory') continue;
    // Quick check: does it contain a .lua file?
    try {
      let hasLua = false;
      for await (const [fname] of handle.entries()) {
        if (fname.endsWith('.lua')) { hasLua = true; break; }
      }
      if (hasLua) names.push(name);
    } catch { /* skip inaccessible */ }
  }
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return names;
}

/**
 * Read a file from a config subfolder.
 * @param {string} configName - subfolder name
 * @param {string} fileName - e.g. 'crew.lua'
 * @returns {Promise<string|null>} file text or null if not found
 */
export async function readConfigFile(configName, fileName) {
  if (!_rootHandle) return null;
  try {
    const dirHandle = await _rootHandle.getDirectoryHandle(configName);
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

/**
 * Write a file to a config subfolder (overwrite).
 * @param {string} configName - subfolder name
 * @param {string} fileName - e.g. 'crew.lua'
 * @param {string} content - file text
 */
export async function writeConfigFile(configName, fileName, content) {
  if (!_rootHandle) throw new Error('No SC-Configs folder set');
  const dirHandle = await _rootHandle.getDirectoryHandle(configName);
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Get/set the active config name. */
export function getActiveConfig() { return _activeConfigName; }
export function setActiveConfig(name) {
  _activeConfigName = name;
  localStorage.setItem(LS_LAST_CONFIG, name);
}
export function getLastConfig() { return localStorage.getItem(LS_LAST_CONFIG); }

/** Check if File System Access API is available. */
export function isSupported() { return typeof window.showDirectoryPicker === 'function'; }

/** Check if a root folder is currently set and accessible. */
export function hasRoot() { return !!_rootHandle; }

/** Get the root folder name for display. */
export function getRootName() { return _rootHandle ? _rootHandle.name : null; }
