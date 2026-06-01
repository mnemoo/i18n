import {
  getCatalogMessage,
  mergeCatalogs,
  sanitizeCatalogNode,
  walkCatalog,
} from "./catalog.js";
import { loadI18nConfig, mergeI18nConfig } from "./config.js";
import { interpolate, renderMessage } from "./message-rendering.js";
import { checkTextWithRules, sanitizeTextWithRules } from "./policy/engine.js";
import { cloneFormats, normalizeLocaleList } from "./shared.js";
import type {
  BannedWordRule,
  BannedWordReport,
  CatalogPolicyReport,
  ConfigInput,
  I18nConfig,
  I18nEvent,
  I18nFormats,
  I18nSnapshot,
  I18nSubscriber,
  Locale,
  MessageCatalog,
  MessageDescriptor,
  MessageFormatter,
  MessageValues,
  MissingMessageContext,
  MissingMessageHandler,
  ReplacementRule,
  SanitizedCatalog,
  SanitizedText,
  TextPolicyOptions,
} from "./types.js";

/** Maximum number of cached auto-sanitize results before least-recent eviction. */
const AUTO_SANITIZE_CACHE_LIMIT = 1000;

/**
 * Stateful i18n runtime.
 *
 * Owns the active locale, translation catalogs, text policy rules, subscribers,
 * and Intl formatter presets.
 */
export class I18n {
  #locale: Locale;
  #fallbackLocales: Locale[];
  #catalogs = new Map<Locale, MessageCatalog>();
  #bannedWords: BannedWordRule[] = [];
  #replacements: ReplacementRule[] = [];
  #formats: I18nFormats;
  #missing: MissingMessageHandler;
  #sanitizeDefaults: Omit<TextPolicyOptions, "locale">;
  #autoSanitize: boolean;
  #autoSanitizeCache = new Map<string, string>();
  #subscribers = new Set<I18nSubscriber>();
  #version = 0;
  #snapshot: I18nSnapshot | undefined;

  constructor(config: I18nConfig = {}) {
    this.#locale = config.locale ?? "en";
    this.#fallbackLocales = normalizeLocaleList(config.fallbackLocale);
    this.#formats = cloneFormats(config.formats);
    this.#missing = config.missing ?? "id";
    this.#sanitizeDefaults = { ...config.sanitize };
    this.#autoSanitize = config.autoSanitize ?? false;

    if (config.catalogs) {
      for (const [locale, catalog] of Object.entries(config.catalogs)) {
        this.#catalogs.set(locale, catalog);
      }
    }

    if (config.bannedWords) {
      this.#bannedWords.push(...config.bannedWords);
    }

    if (config.replacements) {
      this.#replacements.push(...config.replacements);
    }
  }

  get locale(): Locale {
    return this.#locale;
  }

  get fallbackLocales(): Locale[] {
    return [...this.#fallbackLocales];
  }

  getSnapshot = (): I18nSnapshot => {
    if (this.#snapshot === undefined || this.#snapshot.version !== this.#version) {
      this.#snapshot = {
        locale: this.#locale,
        fallbackLocales: [...this.#fallbackLocales],
        version: this.#version,
      };
    }

    return this.#snapshot;
  };

  subscribe = (subscriber: I18nSubscriber): (() => void) => {
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  };

  /** Switch the active locale and notify subscribers. */
  setLocale(locale: Locale): void {
    if (this.#locale === locale) {
      return;
    }

    this.#locale = locale;
    this.#emit({ type: "locale", locale });
  }

  /** Replace the fallback locale chain used when a message is missing. */
  setFallbackLocales(locale: Locale | Locale[]): void {
    const next = normalizeLocaleList(locale);
    if (
      next.length === this.#fallbackLocales.length &&
      next.every((value, index) => value === this.#fallbackLocales[index])
    ) {
      return;
    }

    this.#fallbackLocales = next;
    this.#emit({ type: "locale", locale: this.#locale });
  }

  /** Replace the full catalog for a locale. */
  load(locale: Locale, catalog: MessageCatalog): void {
    this.#catalogs.set(locale, catalog);
    this.#emit({ type: "catalog", locale });
  }

  /** Load multiple locale catalogs at once. */
  loadMany(catalogs: Record<Locale, MessageCatalog>): void {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      this.#catalogs.set(locale, catalog);
    }
    this.#emit({ type: "catalog", locale: this.#locale });
  }

  /** Deep-merge a partial catalog into an existing locale catalog. */
  merge(locale: Locale, catalog: MessageCatalog): void {
    const current = this.#catalogs.get(locale) ?? {};
    this.#catalogs.set(locale, mergeCatalogs(current, catalog));
    this.#emit({ type: "catalog", locale });
  }

  /** Add banned word policy rules at runtime. */
  addBannedWords(rules: readonly BannedWordRule[]): void {
    this.#bannedWords.push(...rules);
    this.#autoSanitizeCache.clear();
    this.#emit({ type: "policy" });
  }

  /** Add automatic replacement rules at runtime. */
  addReplacements(rules: readonly ReplacementRule[]): void {
    this.#replacements.push(...rules);
    this.#autoSanitizeCache.clear();
    this.#emit({ type: "policy" });
  }

  /** Merge and apply a full config object to this runtime. */
  configure(config: I18nConfig): void {
    const merged = mergeI18nConfig(this.toConfig(), config);
    this.#locale = merged.locale ?? this.#locale;
    this.#fallbackLocales = normalizeLocaleList(merged.fallbackLocale);
    this.#catalogs.clear();

    if (merged.catalogs) {
      for (const [locale, catalog] of Object.entries(merged.catalogs)) {
        this.#catalogs.set(locale, catalog);
      }
    }

    this.#bannedWords = [...(merged.bannedWords ?? [])];
    this.#replacements = [...(merged.replacements ?? [])];
    this.#formats = cloneFormats(merged.formats);
    this.#missing = merged.missing ?? "id";
    this.#sanitizeDefaults = { ...merged.sanitize };
    this.#autoSanitize = merged.autoSanitize ?? false;
    this.#autoSanitizeCache.clear();
    this.#emit({ type: "policy" });
  }

  /** Export the current runtime state as a reusable config object. */
  toConfig(): I18nConfig {
    return {
      locale: this.#locale,
      fallbackLocale: [...this.#fallbackLocales],
      catalogs: Object.fromEntries(this.#catalogs.entries()),
      bannedWords: [...this.#bannedWords],
      replacements: [...this.#replacements],
      formats: cloneFormats(this.#formats),
      missing: this.#missing,
      sanitize: { ...this.#sanitizeDefaults },
      autoSanitize: this.#autoSanitize,
    };
  }

  /** Return true when a message exists in the active locale or fallback chain. */
  has(id: string, locale = this.#locale): boolean {
    return this.#resolveMessage(id, locale).message !== undefined;
  }

  /** Translate a message id or descriptor with named interpolation values. */
  t(idOrDescriptor: string | MessageDescriptor, values: MessageValues = {}): string {
    const descriptor = typeof idOrDescriptor === "string" ? { id: idOrDescriptor } : idOrDescriptor;
    const mergedValues = { ...(descriptor.values ?? {}), ...values };
    const resolved = this.#resolveMessage(descriptor.id, this.#locale);

    let output: string;

    if (resolved.message === undefined) {
      const missingContext: MissingMessageContext = {
        id: descriptor.id,
        locale: this.#locale,
        fallbackLocales: [...this.#fallbackLocales],
        values: mergedValues,
      };

      if (descriptor.message !== undefined) {
        missingContext.defaultMessage = descriptor.message;
      }

      output = this.#missingMessage(missingContext);
    } else {
      output = renderMessage(resolved.message, {
        id: descriptor.id,
        locale: resolved.locale,
        values: mergedValues,
        i18n: this,
      });
    }

    return this.#autoSanitize ? this.#autoSanitizeText(output) : output;
  }

  /** Format a number with direct Intl options or a named number preset. */
  formatNumber(value: number | bigint, options?: Intl.NumberFormatOptions | string, locale = this.#locale): string {
    const formatOptions = typeof options === "string" ? this.#formats.numbers?.[options] : options;
    return new Intl.NumberFormat(locale, formatOptions).format(value);
  }

  /** Format a date with direct Intl options or a named date preset. */
  formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions | string, locale = this.#locale): string {
    const date = value instanceof Date ? value : new Date(value);
    const formatOptions = typeof options === "string" ? this.#formats.dates?.[options] : options;
    return new Intl.DateTimeFormat(locale, formatOptions).format(date);
  }

  /** Report banned word matches without mutating the input text. */
  checkText(text: string, options: TextPolicyOptions = {}): BannedWordReport {
    return checkTextWithRules(text, this.#bannedWords, {
      ...options,
      locale: options.locale ?? this.#locale,
    });
  }

  /** Apply replacement rules and banned word policy handling to text. */
  sanitizeText(text: string, options: TextPolicyOptions = {}): SanitizedText {
    return sanitizeTextWithRules(text, this.#bannedWords, this.#replacements, {
      ...this.#sanitizeDefaults,
      ...options,
      locale: options.locale ?? this.#locale,
    });
  }

  /** Report banned word matches across every string message in a catalog. */
  checkCatalog(catalog: MessageCatalog, options: TextPolicyOptions = {}): CatalogPolicyReport {
    const locale = options.locale ?? this.#locale;
    const report: CatalogPolicyReport = {
      ok: true,
      locale,
      violations: [],
      checkedMessages: 0,
      skippedMessages: 0,
    };

    for (const entry of walkCatalog(catalog)) {
      if (entry.kind === "skipped") {
        report.skippedMessages += 1;
        continue;
      }

      report.checkedMessages += 1;
      const textReport = this.checkText(entry.value, { ...options, locale });

      for (const violation of textReport.violations) {
        report.violations.push({
          ...violation,
          messageId: entry.id,
        });
      }
    }

    report.ok = report.violations.length === 0;
    return report;
  }

  /** Apply replacement and banned-word sanitization to every string message in a catalog. */
  sanitizeCatalog(catalog: MessageCatalog, options: TextPolicyOptions = {}): SanitizedCatalog {
    const locale = options.locale ?? this.#locale;
    const sanitized = sanitizeCatalogNode(catalog, (id, value) => {
      const result = this.sanitizeText(value, { ...options, locale });
      return { id, result };
    });

    return {
      catalog: sanitized.catalog,
      changed: sanitized.changed,
      locale,
      checkedMessages: sanitized.checkedMessages,
      skippedMessages: sanitized.skippedMessages,
      replacements: sanitized.replacements,
      violations: sanitized.violations,
    };
  }

  #resolveMessage(id: string, locale: Locale): { message?: string | MessageFormatter; locale: Locale } {
    for (const candidate of [locale, ...this.#fallbackLocales]) {
      const catalog = this.#catalogs.get(candidate);
      const message = catalog ? getCatalogMessage(catalog, id) : undefined;

      if (message !== undefined) {
        return { message, locale: candidate };
      }
    }

    return { locale };
  }

  /**
   * Auto-sanitize a rendered message, memoized by locale + text.
   *
   * Keeps `t()` cheap inside render loops: identical output is sanitized once
   * and reused. The cache is an LRU bounded by AUTO_SANITIZE_CACHE_LIMIT so
   * interpolated one-off strings cannot grow it without bound, and it is cleared
   * whenever policy rules change (see addBannedWords/addReplacements/configure).
   */
  #autoSanitizeText(output: string): string {
    const key = `${this.#locale} ${output}`;
    const cached = this.#autoSanitizeCache.get(key);

    if (cached !== undefined) {
      // Refresh recency: re-insert moves the key to the most-recent position.
      this.#autoSanitizeCache.delete(key);
      this.#autoSanitizeCache.set(key, cached);
      return cached;
    }

    const result = this.sanitizeText(output).text;
    this.#autoSanitizeCache.set(key, result);

    if (this.#autoSanitizeCache.size > AUTO_SANITIZE_CACHE_LIMIT) {
      const oldest = this.#autoSanitizeCache.keys().next().value;
      if (oldest !== undefined) {
        this.#autoSanitizeCache.delete(oldest);
      }
    }

    return result;
  }

  #missingMessage(context: MissingMessageContext): string {
    if (context.defaultMessage !== undefined) {
      return interpolate(context.defaultMessage, context.values);
    }

    if (this.#missing === "throw") {
      throw new Error(`Missing i18n message "${context.id}" for locale "${context.locale}"`);
    }

    if (typeof this.#missing === "function") {
      return this.#missing(context);
    }

    return context.id;
  }

  #emit(event: I18nEvent): void {
    this.#version += 1;
    const snapshot = this.getSnapshot();

    for (const subscriber of this.#subscribers) {
      subscriber(event, snapshot);
    }
  }
}

/** Create an i18n runtime from a config object. */
export function createI18n(config: I18nConfig = {}): I18n {
  return new I18n(config);
}

/** Load config input and create an i18n runtime from it. */
export async function createI18nFromConfig(input: ConfigInput): Promise<I18n> {
  return createI18n(await loadI18nConfig(input));
}
