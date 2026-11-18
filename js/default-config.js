/**
 * default-config.js — the editor's built-in default configuration.
 *
 * A config is a set of five files. The editor ships one such set in ./data/,
 * a copy of the `sc-editor` config (VV adjusted routes with all four catapults
 * in use, plus common_disabled.xml). It is what the editor shows at startup,
 * and it fills in any file that a config folder or an imported folder lacks,
 * so the editor always holds a complete config.
 *
 * The editor edits crew.lua and the routes file, and repoints GroundCrew.lua
 * when a catapult is disabled. The two XML files are carried along unchanged.
 */

/** Config file names by key. Same order as the SC-Config toolkit's SC_FILES. */
export const CONFIG_FILES = {
  crew: 'crew.lua',
  rr: 'USS_Nimitz_RunwaysAndRoutes.lua',
  common: 'common.xml',
  commonDisabled: 'common_disabled.xml',
  groundCrew: 'GroundCrew.lua',
};

/** Where the five files go inside the DCS install folder. */
export const DCS_SCRIPTS_PATH = 'CoreMods/tech/USS_Nimitz/scripts';

/**
 * Fetch the built-in default set.
 * @param {string} [baseUrl]
 * @returns {Promise<Object<string,string>>} file texts, keyed like CONFIG_FILES
 * @throws if any of the five files cannot be fetched
 */
export async function fetchDefaultConfig(baseUrl = './data/') {
  const entries = await Promise.all(
    Object.entries(CONFIG_FILES).map(async ([key, fileName]) => {
      const res = await fetch(baseUrl + fileName);
      if (!res.ok) throw new Error(`${fileName}: HTTP ${res.status}`);
      return [key, await res.text()];
    })
  );
  return Object.fromEntries(entries);
}
