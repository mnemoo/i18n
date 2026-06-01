import { loadI18nConfig } from "../config.js";
import { createI18n } from "../i18n.js";
import { socialBannedWordsPreset } from "../policy/presets.js";
import type {
  BannedWordRule,
  CatalogPolicyReport,
  ConfigInput,
  Locale,
  MessageCatalog,
} from "../types.js";

export type MaybePromise<T> = T | Promise<T>;

export type MaybeFactory<T> = T | (() => MaybePromise<T>);

export type VitePluginApply =
  | "build"
  | "serve"
  | ((config: unknown, env: { command: string; mode: string; ssrBuild?: boolean }) => boolean);

export type VitePluginLike = {
  name: string;
  apply?: VitePluginApply;
  enforce?: "pre" | "post";
  buildStart(): Promise<void>;
};

export type ViteSocialCheckOptions = {
  config?: ConfigInput;
  catalog?: MaybeFactory<MessageCatalog>;
  catalogs?: MaybeFactory<Record<Locale, MessageCatalog>>;
  locale?: Locale;
  bannedWords?: readonly BannedWordRule[];
  failOnViolation?: boolean;
  requireCatalog?: boolean;
  maxViolations?: number;
  onReport?: (report: ViteSocialCheckReport) => void | Promise<void>;
};

export type ViteI18nPluginOptions = ViteSocialCheckOptions & {
  name?: string;
  apply?: VitePluginApply;
  enforce?: "pre" | "post";
};

export type ViteSocialCheckReport = CatalogPolicyReport & {
  catalogFound: boolean;
};

export function createViteI18nPlugin(options: ViteI18nPluginOptions = {}): VitePluginLike {
  const plugin: VitePluginLike = {
    name: options.name ?? "@mnemoo/i18n/social-mode-check",
    apply: options.apply ?? "build",
    async buildStart() {
      const report = await checkViteSocialTranslations(options);
      await options.onReport?.(report);

      if (!report.ok && (options.failOnViolation ?? true)) {
        throw new Error(formatViteSocialCheckReport(report, options));
      }
    },
  };

  if (options.enforce !== undefined) {
    plugin.enforce = options.enforce;
  }

  return plugin;
}

export async function checkViteSocialTranslations(
  options: ViteSocialCheckOptions = {},
): Promise<ViteSocialCheckReport> {
  const locale = options.locale ?? "en";
  const loadedConfig = options.config ? await loadI18nConfig(options.config) : {};
  const explicitCatalog = await resolveMaybe(options.catalog);
  const explicitCatalogs = await resolveMaybe(options.catalogs);
  const catalog = explicitCatalog ?? explicitCatalogs?.[locale] ?? loadedConfig.catalogs?.[locale];

  if (!catalog) {
    return {
      ok: !(options.requireCatalog ?? true),
      locale,
      violations: [],
      checkedMessages: 0,
      skippedMessages: 0,
      catalogFound: false,
    };
  }

  const i18n = createI18n({
    locale,
    bannedWords: options.bannedWords ?? socialBannedWordsPreset,
  });
  const report = i18n.checkCatalog(catalog, { locale });

  return {
    ...report,
    catalogFound: true,
  };
}

function formatViteSocialCheckReport(
  report: ViteSocialCheckReport,
  options: Pick<ViteSocialCheckOptions, "maxViolations">,
): string {
  if (!report.catalogFound) {
    return `@mnemoo/i18n social mode check failed: catalog for locale "${report.locale}" was not found.`;
  }

  const maxViolations = options.maxViolations ?? 20;
  const shownViolations = report.violations.slice(0, maxViolations);
  const lines = shownViolations.map((violation) => {
    const replacement = violation.replacement ? ` -> "${violation.replacement}"` : "";
    return `- ${violation.messageId}: "${violation.match}"${replacement} (${violation.ruleId})`;
  });
  const remaining = report.violations.length - shownViolations.length;

  if (remaining > 0) {
    lines.push(`- ...and ${remaining} more`);
  }

  return [
    `@mnemoo/i18n social mode check failed: ${report.violations.length} restricted phrase(s) found in locale "${report.locale}".`,
    ...lines,
  ].join("\n");
}

async function resolveMaybe<T>(input: MaybeFactory<T> | undefined): Promise<T | undefined> {
  if (input === undefined) {
    return undefined;
  }

  return isFactory(input) ? input() : input;
}

function isFactory<T>(input: MaybeFactory<T>): input is () => MaybePromise<T> {
  return typeof input === "function";
}
