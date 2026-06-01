import type { BannedWordRule, ReplacementRule } from "../types.js";

export type StakeEngineSocialRestrictedPhrase = {
  restricted: string;
  replacement: string;
};

/**
 * Stake Engine social mode restricted phrase table.
 *
 * These phrases come from the Stake Engine social mode documentation for
 * stake.us games. In social mode the game should use English replacements,
 * regardless of the incoming lang query parameter.
 */
export const stakeEngineSocialRestrictedPhrases = [
  { restricted: "be awarded to player’s accounts", replacement: "appear in player’s accounts" },
  { restricted: "place your bets", replacement: "come and play / join in the game" },
  { restricted: "at the cost of", replacement: "for" },
  { restricted: "bonus buy", replacement: "bonus / feature" },
  { restricted: "buy bonus", replacement: "get bonus" },
  { restricted: "loss limit", replacement: "stop limit" },
  { restricted: "loss streak", replacement: "miss streak" },
  { restricted: "paid out", replacement: "won" },
  { restricted: "pay table", replacement: "win table" },
  { restricted: "pays out", replacement: "win" },
  { restricted: "pay out", replacement: "win / won" },
  { restricted: "total bet", replacement: "total play" },
  { restricted: "win feature", replacement: "play feature" },
  { restricted: "betting", replacement: "playing" },
  { restricted: "deposit", replacement: "get coins" },
  { restricted: "purchase", replacement: "play" },
  { restricted: "currency", replacement: "token" },
  { restricted: "cost of", replacement: "can be played for" },
  { restricted: "withdraw", replacement: "redeem" },
  { restricted: "bought", replacement: "instantly triggered" },
  { restricted: "credit", replacement: "coins" },
  { restricted: "gamble", replacement: "play" },
  { restricted: "profit", replacement: "net gain" },
  { restricted: "rebet", replacement: "respin" },
  { restricted: "stake", replacement: "play amount" },
  { restricted: "wager", replacement: "play" },
  { restricted: "bets", replacement: "plays" },
  { restricted: "cash", replacement: "coins" },
  { restricted: "money", replacement: "coins" },
  { restricted: "paid", replacement: "won" },
  { restricted: "payer", replacement: "winner" },
  { restricted: "pays", replacement: "wins" },
  { restricted: "bet", replacement: "play" },
  { restricted: "buy", replacement: "play" },
  { restricted: "pay", replacement: "win" },
] as const satisfies readonly StakeEngineSocialRestrictedPhrase[];

/**
 * Banned-word rules for Stake Engine social mode.
 *
 * Use this with checkText/checkCatalog to fail content that still contains
 * restricted gambling phrases.
 */
export const socialBannedWordsPreset: readonly BannedWordRule[] = stakeEngineSocialRestrictedPhrases
  .map((phrase) => ({
    id: socialRuleId(phrase.restricted),
    word: phrase.restricted,
    replacement: phrase.replacement,
    wholeWord: true,
  }));

/**
 * Replacement rules for Stake Engine social mode.
 *
 * Use this with sanitizeText/sanitizeCatalog to automatically rewrite
 * restricted gambling phrases to the approved social-mode copy.
 */
export const socialReplacementPreset: readonly ReplacementRule[] = stakeEngineSocialRestrictedPhrases
  .map((phrase) => ({
    id: `${socialRuleId(phrase.restricted)}.replace`,
    from: phrase.restricted,
    to: phrase.replacement,
    wholeWord: true,
    preserveCase: true,
  }));

function socialRuleId(phrase: string): string {
  const slug = phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ".")
    .replace(/^\.+|\.+$/gu, "");
  return `stake.social.${slug}`;
}
