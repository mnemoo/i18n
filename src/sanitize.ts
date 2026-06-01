import { checkTextWithRules, sanitizeTextWithRules } from "./policy/engine.js";
import {
  socialBannedWordsPreset,
  socialReplacementPreset,
} from "./policy/presets.js";
import type {
  BannedWordReport,
  BannedWordRule,
  Locale,
  ReplacementRule,
  SanitizedText,
  TextPolicyOptions,
} from "./types.js";

/**
 * Options for the standalone {@link sanitizeText}.
 *
 * `bannedWords` and `replacements` default to the Stake Engine social-mode
 * presets, so the common case needs no rule configuration.
 */
export type SanitizeTextOptions = TextPolicyOptions & {
  bannedWords?: readonly BannedWordRule[];
  replacements?: readonly ReplacementRule[];
};

/** Options for the standalone {@link checkText}. */
export type CheckTextOptions = {
  locale?: Locale;
  bannedWords?: readonly BannedWordRule[];
};

/**
 * Sanitize a single string without constructing an I18n instance.
 *
 * Banned words and replacements default to the Stake Engine social-mode
 * presets, so `sanitizeText("Total bet").text` is `"Total play"` with no setup.
 * Override `bannedWords`/`replacements` for custom rule sets, or `mode`
 * (`"replace"` by default) to mask/remove instead of replacing.
 */
export function sanitizeText(text: string, options: SanitizeTextOptions = {}): SanitizedText {
  const {
    bannedWords = socialBannedWordsPreset,
    replacements = socialReplacementPreset,
    locale = "en",
    ...rest
  } = options;

  return sanitizeTextWithRules(text, bannedWords, replacements, { ...rest, locale });
}

/**
 * Report banned-word matches in a single string without an I18n instance.
 *
 * `bannedWords` defaults to the Stake Engine social-mode preset.
 */
export function checkText(text: string, options: CheckTextOptions = {}): BannedWordReport {
  const { bannedWords = socialBannedWordsPreset, locale = "en" } = options;
  return checkTextWithRules(text, bannedWords, { locale });
}
