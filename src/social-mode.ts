import { mergeCatalogs } from "./catalog.js";
import {
  socialBannedWordsPreset,
  socialReplacementPreset,
} from "./policy/presets.js";
import type {
  I18nConfig,
  Locale,
  MessageCatalog,
  TextPolicyOptions,
} from "./types.js";

export type StakeEngineSocialModeQuery =
  | string
  | URL
  | URLSearchParams
  | Record<string, string | number | boolean | null | undefined>;

export type StakeEngineSocialModeConfigOptions = {
  /**
   * Source for the `social` and `lang` parameters. Accepts a full URL, a search
   * string, `URLSearchParams`, or a plain record. When omitted it defaults to
   * `window.location.href` in the browser, so a bare
   * `createStakeEngineSocialModeConfig()` auto-detects social mode and language.
   * Under SSR/Node (no `location`) it falls back to non-social English copy.
   */
  query?: StakeEngineSocialModeQuery;
  social?: string | number | boolean | null;
  lang?: Locale | null;
  locale?: Locale;
  fallbackLocale?: Locale | Locale[];
  catalogs?: Record<Locale, MessageCatalog>;
  sanitize?: Omit<TextPolicyOptions, "locale">;
  /**
   * Social-mode-only copy that wins over the English catalog for the listed
   * message ids. Use it when word-by-word auto replacement reads badly and the
   * whole sentence needs to be rewritten. Ignored when social mode is off.
   */
  socialOverrides?: MessageCatalog;
};

export function isStakeEngineSocialMode(query: StakeEngineSocialModeQuery | string | number | boolean | null | undefined): boolean {
  return readQueryValue(query, "social") === "true";
}

export function readStakeEngineLang(query: StakeEngineSocialModeQuery | null | undefined): Locale | undefined {
  return readQueryValue(query, "lang");
}

export function resolveStakeEngineLocale(
  query: StakeEngineSocialModeQuery | null | undefined,
  fallbackLocale: Locale = "en",
): Locale {
  if (isStakeEngineSocialMode(query)) {
    return "en";
  }

  return readStakeEngineLang(query) ?? fallbackLocale;
}

export function createStakeEngineSocialModeConfig(
  options: StakeEngineSocialModeConfigOptions = {},
): I18nConfig {
  const query = options.query ?? readAmbientHref();
  const querySocial = options.social === undefined ? isStakeEngineSocialMode(query) : isStakeEngineSocialMode(options.social);
  const requestedLocale = options.lang ?? readStakeEngineLang(query) ?? options.locale ?? "en";
  const config: I18nConfig = {
    locale: querySocial ? "en" : requestedLocale,
  };

  if (options.catalogs !== undefined) {
    config.catalogs = options.catalogs;
  }

  if (querySocial) {
    config.fallbackLocale = ["en"];
    config.bannedWords = socialBannedWordsPreset;
    config.replacements = socialReplacementPreset;
    config.sanitize = { mode: "replace", ...(options.sanitize ?? {}) };
    config.autoSanitize = true;

    if (options.socialOverrides !== undefined) {
      const base = config.catalogs ?? {};
      config.catalogs = {
        ...base,
        en: mergeCatalogs(base.en ?? {}, options.socialOverrides),
      };
    }

    return config;
  }

  if (options.fallbackLocale !== undefined) {
    config.fallbackLocale = options.fallbackLocale;
  }

  if (options.sanitize !== undefined) {
    config.sanitize = options.sanitize;
  }

  return config;
}

/**
 * Ambient browser URL, used when no explicit `query` is passed so a single
 * `createStakeEngineSocialModeConfig()` call can read `social`/`lang` from
 * `window.location`. Returns undefined under SSR/Node where there is no
 * `location`, leaving the non-social English default in place.
 */
function readAmbientHref(): string | undefined {
  const scope = globalThis as { location?: { href?: string } };
  return scope.location?.href;
}

function readQueryValue(
  query: StakeEngineSocialModeQuery | string | number | boolean | null | undefined,
  key: string,
): string | undefined {
  if (query === null || query === undefined) {
    return undefined;
  }

  if (typeof query === "boolean" || typeof query === "number") {
    return String(query);
  }

  if (typeof query === "string") {
    if (query === "true" || query === "false") {
      return query;
    }

    const params = parseQueryString(query);
    return params?.get(key) ?? undefined;
  }

  if (query instanceof URL) {
    return query.searchParams.get(key) ?? undefined;
  }

  if (query instanceof URLSearchParams) {
    return query.get(key) ?? undefined;
  }

  const value = query[key];
  return value === null || value === undefined ? undefined : String(value);
}

function parseQueryString(value: string): URLSearchParams | undefined {
  try {
    return new URL(value).searchParams;
  } catch {
    if (value.startsWith("?")) {
      return new URLSearchParams(value.slice(1));
    }

    if (value.includes("=")) {
      return new URLSearchParams(value);
    }
  }

  return undefined;
}
