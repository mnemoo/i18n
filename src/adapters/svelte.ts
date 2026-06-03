import type { I18n } from "../i18n.js";
import type { I18nKeysOf, SvelteI18nSnapshot, SvelteI18nStore } from "../types.js";

/**
 * Create a Svelte-readable store for Svelte 5 integration.
 *
 * The return value follows the store subscribe contract and also exposes
 * direct helpers for translations, locale switching, and text policy checks.
 * When `i18n` came from {@link composeI18nModules}, the store's `t`
 * autocompletes the composed keys; a plain I18n accepts any string.
 */
export function createSvelteI18n<T extends I18n>(i18n: T): SvelteI18nStore<I18nKeysOf<T>> {
  const getSnapshot = (): SvelteI18nSnapshot<I18nKeysOf<T>> => ({
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
