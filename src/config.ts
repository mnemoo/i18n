import { mergeCatalogs } from "./catalog.js";
import { isObject } from "./shared.js";
import type {
  BannedWordRule,
  ConfigInput,
  DateFormatMap,
  I18nConfig,
  I18nFormats,
  Locale,
  MessageCatalog,
  NumberFormatMap,
  ReplacementRule,
} from "./types.js";

let cachedDynamicImport: ((specifier: string) => Promise<unknown>) | undefined;

/**
 * Lazily-constructed dynamic `import()`.
 *
 * Built through the Function constructor so bundlers (Vite, Rollup, esbuild,
 * webpack) do not statically resolve the Node-only specifiers below for browser
 * targets. It is created on first use rather than at module load, so importing
 * this package stays compatible with strict CSP (`script-src` without
 * `'unsafe-eval'`); the shim is only ever needed when loading config from a
 * local file path in Node.
 */
function dynamicImport(specifier: string): Promise<unknown> {
  cachedDynamicImport ??= new Function(
    "specifier",
    "return import(specifier)",
  ) as (specifier: string) => Promise<unknown>;
  return cachedDynamicImport(specifier);
}

/** Type helper for authoring TS i18n config files. */
export function defineI18nConfig<const T extends I18nConfig>(config: T): T {
  return config;
}

/**
 * Load one or more config inputs.
 *
 * Supports config objects, promises, factories, arrays of those inputs, and
 * local config files (JSON files and JS/TS module specifiers the runtime can
 * import). Remote specifiers (HTTP(S) and `data:` URLs) are rejected so config
 * is only ever read from the bundle or local files.
 */
export async function loadI18nConfig(input: ConfigInput): Promise<I18nConfig> {
  if (isConfigInputArray(input)) {
    const configs = await Promise.all(input.map((item) => loadI18nConfig(item)));
    return mergeI18nConfig(...configs);
  }

  if (typeof input === "function") {
    return loadI18nConfig(await input());
  }

  if (input instanceof Promise) {
    return loadI18nConfig(await input);
  }

  if (typeof input === "string" || input instanceof URL) {
    return loadConfigFromSpecifier(input);
  }

  return input;
}

/** Merge config objects, deep-merging catalogs and appending policy rules. */
export function mergeI18nConfig(...configs: readonly I18nConfig[]): I18nConfig {
  const merged: I18nConfig = {};
  const catalogs: Record<Locale, MessageCatalog> = {};
  const bannedWords: BannedWordRule[] = [];
  const replacements: ReplacementRule[] = [];
  const numbers: NumberFormatMap = {};
  const dates: DateFormatMap = {};

  for (const config of configs) {
    if (config.locale !== undefined) {
      merged.locale = config.locale;
    }

    if (config.fallbackLocale !== undefined) {
      merged.fallbackLocale = config.fallbackLocale;
    }

    if (config.catalogs) {
      for (const [locale, catalog] of Object.entries(config.catalogs)) {
        catalogs[locale] = mergeCatalogs(catalogs[locale] ?? {}, catalog);
      }
    }

    if (config.bannedWords) {
      bannedWords.push(...config.bannedWords);
    }

    if (config.replacements) {
      replacements.push(...config.replacements);
    }

    if (config.formats?.numbers) {
      Object.assign(numbers, config.formats.numbers);
    }

    if (config.formats?.dates) {
      Object.assign(dates, config.formats.dates);
    }

    if (config.missing !== undefined) {
      merged.missing = config.missing;
    }

    if (config.sanitize !== undefined) {
      merged.sanitize = { ...(merged.sanitize ?? {}), ...config.sanitize };
    }

    if (config.autoSanitize !== undefined) {
      merged.autoSanitize = config.autoSanitize;
    }
  }

  if (Object.keys(catalogs).length > 0) {
    merged.catalogs = catalogs;
  }

  if (bannedWords.length > 0) {
    merged.bannedWords = bannedWords;
  }

  if (replacements.length > 0) {
    merged.replacements = replacements;
  }

  const formats: I18nFormats = {};

  if (Object.keys(numbers).length > 0) {
    formats.numbers = numbers;
  }

  if (Object.keys(dates).length > 0) {
    formats.dates = dates;
  }

  if (formats.numbers || formats.dates) {
    merged.formats = formats;
  }

  return merged;
}

async function loadConfigFromSpecifier(input: string | URL): Promise<I18nConfig> {
  const specifier = String(input);

  if (isRemoteSpecifier(specifier)) {
    throw new Error(
      `Remote i18n config loading is not supported: "${specifier}". Import the config module or pass a local file path.`,
    );
  }

  if (specifier.endsWith(".json")) {
    return JSON.parse(await readTextFile(specifier)) as I18nConfig;
  }

  const moduleUrl = specifier.startsWith("file:")
    ? specifier
    : (await pathToFileUrl(specifier)).href;
  const imported = await dynamicImport(moduleUrl);
  return resolveConfigModule(imported);
}

async function readTextFile(path: string): Promise<string> {
  const fs = await dynamicImport("node:fs/promises") as {
    readFile(file: string | URL, encoding: "utf8"): Promise<string>;
  };
  return fs.readFile(await pathToFileUrl(path), "utf8");
}

function resolveConfigModule(moduleValue: unknown): I18nConfig {
  if (isObject(moduleValue)) {
    if ("default" in moduleValue && isObject(moduleValue.default)) {
      return moduleValue.default as I18nConfig;
    }

    if ("config" in moduleValue && isObject(moduleValue.config)) {
      return moduleValue.config as I18nConfig;
    }

    return moduleValue as I18nConfig;
  }

  throw new Error("I18n config module must export a config object");
}

async function pathToFileUrl(path: string): Promise<URL> {
  if (path.startsWith("file:")) {
    return new URL(path);
  }

  const { pathToFileURL } = await dynamicImport("node:url") as {
    pathToFileURL(path: string): URL;
  };
  return pathToFileURL(path);
}

function isRemoteSpecifier(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
}

function isConfigInputArray(input: ConfigInput): input is readonly ConfigInput[] {
  return Array.isArray(input);
}
