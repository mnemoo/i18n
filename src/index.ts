export type * from "./types.js";

export {
  createI18n,
  createI18nFromConfig,
  I18n,
} from "./i18n.js";

export {
  defineI18nConfig,
  loadI18nConfig,
  mergeI18nConfig,
} from "./config.js";

export {
  defineMessage,
  defineMessages,
  plural,
  select,
} from "./messages.js";

export {
  stakeEngineSocialRestrictedPhrases,
  socialBannedWordsPreset,
  socialReplacementPreset,
} from "./policy/presets.js";

export {
  createStakeEngineSocialModeConfig,
  isStakeEngineSocialMode,
  readStakeEngineLang,
  resolveStakeEngineLocale,
} from "./social-mode.js";

export { checkText, sanitizeText } from "./sanitize.js";
export type { CheckTextOptions, SanitizeTextOptions } from "./sanitize.js";

export { createSvelteI18n } from "./adapters/svelte.js";
export { createReactI18n } from "./adapters/react.js";
export {
  checkViteSocialTranslations,
  createViteI18nPlugin,
} from "./adapters/vite.js";
export type {
  MaybeFactory,
  MaybePromise,
  ViteI18nPluginOptions,
  VitePluginApply,
  VitePluginLike,
  ViteSocialCheckOptions,
  ViteSocialCheckReport,
} from "./adapters/vite.js";
