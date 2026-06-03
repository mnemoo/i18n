import { mergeI18nConfig } from "./config.js";
import { createI18n } from "./i18n.js";
import type {
  BannedWordRule,
  I18nConfig,
  Locale,
  MessageCatalog,
  MessageFormatter,
  ReplacementRule,
  TypedI18n,
} from "./types.js";

/**
 * A self-contained translation contribution from a single package.
 *
 * Each feature package (BET UI, wallet, free spins, ...) exports one module and
 * the host game collects them with {@link composeI18nModules} to get a single
 * `t()` endpoint. When `namespace` is set, every key the package authors is
 * reached as `${namespace}.${key}`, so two packages cannot collide. When it is
 * omitted the catalogs merge in exactly as authored.
 */
export interface I18nModule {
  /** Optional key prefix. Omit it to merge catalogs without a prefix. */
  namespace?: string;
  /** Per-locale catalogs, authored without the namespace prefix. */
  catalogs: Record<Locale, MessageCatalog>;
  /** Optional banned-word policy rules contributed by this package. */
  bannedWords?: readonly BannedWordRule[];
  /** Optional replacement rules contributed by this package. */
  replacements?: readonly ReplacementRule[];
}

/**
 * Identity helper for authoring a module.
 *
 * The `const` type parameter preserves the literal catalog shape, which is what
 * lets {@link composeI18nModules} infer every translation key for `t()`
 * autocomplete. Author catalogs inline (or with `as const`) for the keys to
 * survive; catalogs loaded from JSON files or async config widen to
 * MessageCatalog and lose their literal keys.
 */
export function defineI18nModule<const T extends I18nModule>(module: T): T {
  return module;
}

/** Flatten a nested catalog into a union of dot-separated leaf key paths. */
type CatalogKeyPaths<T> = {
  [K in Extract<keyof T, string>]: T[K] extends MessageFormatter
    ? K
    : T[K] extends string
      ? K
      : T[K] extends object
        ? `${K}.${CatalogKeyPaths<T[K]>}`
        : K;
}[Extract<keyof T, string>];

type NamespaceOf<M> = M extends { namespace: infer NS extends string } ? NS : undefined;

type ApplyNamespace<NS extends string | undefined, K extends string> = NS extends string
  ? `${NS}.${K}`
  : K;

/**
 * Every translation key a module exposes, prefixed by its namespace, unioned
 * across all of its locales.
 */
export type I18nModuleKeys<M extends I18nModule> = M extends { catalogs: infer C }
  ? { [L in keyof C]: ApplyNamespace<NamespaceOf<M>, CatalogKeyPaths<C[L]>> }[keyof C]
  : never;

/**
 * Compose modules (plus an optional base config) into one I18n runtime.
 *
 * Namespaced modules are wrapped under their namespace; un-namespaced modules
 * merge as authored. Catalogs deep-merge and policy rules concatenate, so two
 * modules may safely extend the same namespace. The returned runtime's `t()`
 * autocompletes every contributed key while still accepting any string.
 */
export function composeI18nModules<const M extends readonly I18nModule[]>(
  modules: M,
  base?: I18nConfig,
): TypedI18n<I18nModuleKeys<M[number]>> {
  const merged = mergeI18nConfig(base ?? {}, ...modules.map(moduleToConfig));
  return createI18n(merged) as TypedI18n<I18nModuleKeys<M[number]>>;
}

function moduleToConfig(module: I18nModule): I18nConfig {
  const { namespace } = module;
  let catalogs: Record<Locale, MessageCatalog>;

  if (namespace) {
    catalogs = {};
    for (const [locale, catalog] of Object.entries(module.catalogs)) {
      catalogs[locale] = { [namespace]: catalog };
    }
  } else {
    catalogs = module.catalogs;
  }

  const config: I18nConfig = { catalogs };

  if (module.bannedWords) {
    config.bannedWords = module.bannedWords;
  }

  if (module.replacements) {
    config.replacements = module.replacements;
  }

  return config;
}
