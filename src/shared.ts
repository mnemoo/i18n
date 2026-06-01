import type { I18nFormats, Locale } from "./types.js";

export function cloneFormats(formats: I18nFormats | undefined): I18nFormats {
  const cloned: I18nFormats = {};

  if (formats?.numbers) {
    cloned.numbers = { ...formats.numbers };
  }

  if (formats?.dates) {
    cloned.dates = { ...formats.dates };
  }

  return cloned;
}

export function normalizeLocaleList(locale: Locale | Locale[] | undefined): Locale[] {
  if (locale === undefined) {
    return [];
  }

  return Array.isArray(locale) ? [...locale] : [locale];
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
