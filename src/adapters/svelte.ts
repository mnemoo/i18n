import type { I18n } from "../i18n.js";
import type { SvelteI18nSnapshot, SvelteI18nStore } from "../types.js";

/**
 * Create a Svelte-readable store for Svelte 5 integration.
 *
 * The return value follows the store subscribe contract and also exposes
 * direct helpers for translations, locale switching, and text policy checks.
 */
export function createSvelteI18n(i18n: I18n): SvelteI18nStore {
  const getSnapshot = (): SvelteI18nSnapshot => ({
    ...i18n.getSnapshot(),
    t: i18n.t.bind(i18n),
    checkText: i18n.checkText.bind(i18n),
    sanitizeText: i18n.sanitizeText.bind(i18n),
    checkCatalog: i18n.checkCatalog.bind(i18n),
    sanitizeCatalog: i18n.sanitizeCatalog.bind(i18n),
  });

  return {
    subscribe(run) {
      run(getSnapshot());
      return i18n.subscribe(() => {
        run(getSnapshot());
      });
    },
    t: i18n.t.bind(i18n),
    setLocale: i18n.setLocale.bind(i18n),
    load: i18n.load.bind(i18n),
    checkText: i18n.checkText.bind(i18n),
    sanitizeText: i18n.sanitizeText.bind(i18n),
    checkCatalog: i18n.checkCatalog.bind(i18n),
    sanitizeCatalog: i18n.sanitizeCatalog.bind(i18n),
    getSnapshot,
  };
}
