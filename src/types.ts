import type { I18n } from "./i18n.js";

export type Locale = string;

export type MessagePrimitive = string | number | bigint | boolean | Date | null | undefined;

export type MessageValues = Record<string, MessagePrimitive>;

export type MessageContext = {
  locale: Locale;
  id: string;
  values: MessageValues;
  i18n: I18n;
};

export type MessageFormatter = (values: MessageValues, context: MessageContext) => string;

export type MessageNode = string | MessageFormatter | MessageCatalog;

export interface MessageCatalog {
  [key: string]: MessageNode;
}

export type MessageDescriptor = {
  id: string;
  message?: string;
  values?: MessageValues;
  comment?: string;
};

export type MissingMessageContext = {
  id: string;
  locale: Locale;
  fallbackLocales: Locale[];
  values: MessageValues;
  defaultMessage?: string;
};

export type MissingMessageHandler = "id" | "throw" | ((context: MissingMessageContext) => string);

export type RulePattern = string | RegExp;

export type Severity = "info" | "warning" | "error";

/**
 * Automatic text replacement rule.
 *
 * Use this for copy normalization, for example replacing "cashout" with
 * "cash out" before text is rendered or sent to translators.
 */
export type ReplacementRule = {
  id?: string;
  from: RulePattern;
  to: string | ((match: string, context: ReplacementContext) => string);
  locale?: Locale | Locale[];
  matchCase?: boolean;
  wholeWord?: boolean;
  preserveCase?: boolean;
};

/**
 * Banned word policy rule.
 *
 * A banned rule reports policy violations through checkText and can also
 * provide a replacement used by sanitizeText.
 */
export type BannedWordRule = {
  id?: string;
  word: RulePattern;
  locale?: Locale | Locale[];
  replacement?: string | ((match: string, context: ReplacementContext) => string);
  severity?: Severity;
  matchCase?: boolean;
  wholeWord?: boolean;
};

export type ReplacementContext = {
  locale: Locale;
  ruleId: string;
  index: number;
  input: string;
};

export type BannedWordViolation = {
  ruleId: string;
  match: string;
  index: number;
  endIndex: number;
  locale: Locale;
  severity: Severity;
  replacement?: string;
};

export type ReplacementChange = {
  ruleId: string;
  from: string;
  to: string;
  index: number;
  endIndex: number;
  locale: Locale;
  kind: "replacement" | "banned-word";
};

export type BannedWordReport = {
  ok: boolean;
  text: string;
  locale: Locale;
  violations: BannedWordViolation[];
};

export type CatalogPolicyViolation = BannedWordViolation & {
  messageId: string;
};

export type CatalogPolicyReport = {
  ok: boolean;
  locale: Locale;
  violations: CatalogPolicyViolation[];
  checkedMessages: number;
  skippedMessages: number;
};

export type SanitizeMode = "replace" | "mask" | "remove" | "keep" | "throw";

export type TextPolicyOptions = {
  locale?: Locale;
  mode?: SanitizeMode;
  mask?: string;
};

export type SanitizedText = {
  text: string;
  changed: boolean;
  locale: Locale;
  violations: BannedWordViolation[];
  replacements: ReplacementChange[];
};

export type SanitizedCatalog = {
  catalog: MessageCatalog;
  changed: boolean;
  locale: Locale;
  checkedMessages: number;
  skippedMessages: number;
  replacements: Array<ReplacementChange & { messageId: string }>;
  violations: CatalogPolicyViolation[];
};

export type NumberFormatMap = Record<string, Intl.NumberFormatOptions>;

export type DateFormatMap = Record<string, Intl.DateTimeFormatOptions>;

export type I18nFormats = {
  numbers?: NumberFormatMap;
  dates?: DateFormatMap;
};

/**
 * Complete runtime configuration for @mnemoo/i18n.
 *
 * The same shape can be used from TypeScript config files, JSON config files,
 * or direct runtime configuration objects.
 */
export type I18nConfig = {
  locale?: Locale;
  fallbackLocale?: Locale | Locale[];
  catalogs?: Record<Locale, MessageCatalog>;
  bannedWords?: readonly BannedWordRule[];
  replacements?: readonly ReplacementRule[];
  formats?: I18nFormats;
  missing?: MissingMessageHandler;
  sanitize?: Omit<TextPolicyOptions, "locale">;
  /**
   * When true, every `t()` result is passed through `sanitizeText` before it is
   * returned, using the configured `sanitize` options, `replacements`, and
   * `bannedWords`. Stake Engine social mode turns this on so restricted phrases
   * are replaced automatically without wrapping each call in `sanitizeText`.
   * Sanitizing is a no-op on copy that already contains no restricted phrases.
   */
  autoSanitize?: boolean;
};

export type I18nEvent =
  | { type: "locale"; locale: Locale }
  | { type: "catalog"; locale: Locale }
  | { type: "policy" };

export type I18nSnapshot = {
  locale: Locale;
  fallbackLocales: Locale[];
  version: number;
};

export type I18nSubscriber = (event: I18nEvent, snapshot: I18nSnapshot) => void;

export type ConfigInput =
  | I18nConfig
  | Promise<I18nConfig>
  | (() => I18nConfig | Promise<I18nConfig>)
  | string
  | URL
  | readonly ConfigInput[];

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string | MessageFormatter>> & {
  other: string | MessageFormatter;
};

export type SelectForms = Record<string, string | MessageFormatter> & {
  other: string | MessageFormatter;
};

export type SvelteI18nStore = {
  subscribe(run: (snapshot: SvelteI18nSnapshot) => void): () => void;
  t(id: string | MessageDescriptor, values?: MessageValues): string;
  setLocale(locale: Locale): void;
  load(locale: Locale, catalog: MessageCatalog): void;
  checkText(text: string, options?: TextPolicyOptions): BannedWordReport;
  sanitizeText(text: string, options?: TextPolicyOptions): SanitizedText;
  checkCatalog(catalog: MessageCatalog, options?: TextPolicyOptions): CatalogPolicyReport;
  sanitizeCatalog(catalog: MessageCatalog, options?: TextPolicyOptions): SanitizedCatalog;
  getSnapshot(): SvelteI18nSnapshot;
};

export type SvelteI18nSnapshot = I18nSnapshot & {
  t(id: string | MessageDescriptor, values?: MessageValues): string;
  checkText(text: string, options?: TextPolicyOptions): BannedWordReport;
  sanitizeText(text: string, options?: TextPolicyOptions): SanitizedText;
  checkCatalog(catalog: MessageCatalog, options?: TextPolicyOptions): CatalogPolicyReport;
  sanitizeCatalog(catalog: MessageCatalog, options?: TextPolicyOptions): SanitizedCatalog;
};

export type ReactContextLike<T> = {
  Provider: unknown;
  _currentValue?: T;
};

export type ReactRuntimeLike<Element = unknown> = {
  createContext<T>(defaultValue: T): ReactContextLike<T>;
  useContext<T>(context: ReactContextLike<T>): T;
  useSyncExternalStore<T>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T;
  createElement?(
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): Element;
};

export type ReactI18nBindings<Element = unknown> = {
  I18nContext: ReactContextLike<I18n>;
  I18nProvider(props: { value?: I18n; children?: unknown }): Element;
  useI18n(): I18n;
  useI18nSnapshot(): I18nSnapshot;
  useT(): (id: string | MessageDescriptor, values?: MessageValues) => string;
  useLocale(): Locale;
};
