import { DEFAULT_MASK, WORD_BOUNDARY } from "../constants.js";
import type {
  BannedWordReport,
  BannedWordRule,
  BannedWordViolation,
  Locale,
  ReplacementChange,
  ReplacementContext,
  ReplacementRule,
  RulePattern,
  SanitizeMode,
  SanitizedText,
} from "../types.js";

type ResolvedTextPolicyOptions = {
  locale: Locale;
  mode?: SanitizeMode;
  mask?: string;
};

export function checkTextWithRules(
  text: string,
  rules: readonly BannedWordRule[],
  options: Pick<ResolvedTextPolicyOptions, "locale">,
): BannedWordReport {
  const violations: BannedWordViolation[] = [];

  for (const rule of rules) {
    if (!matchesLocale(rule.locale, options.locale)) {
      continue;
    }

    const matcher = createMatcher(rule.word, matcherOptions(rule));

    for (const match of matchAllWithIndex(text, matcher)) {
      const ruleId = rule.id ?? patternId(rule.word);
      const replacement = resolveReplacement(rule.replacement, match.value, {
        locale: options.locale,
        ruleId,
        index: match.index,
        input: text,
      });

      const violation: BannedWordViolation = {
        ruleId,
        match: match.value,
        index: match.index,
        endIndex: match.index + match.value.length,
        locale: options.locale,
        severity: rule.severity ?? "error",
      };

      if (replacement !== undefined) {
        violation.replacement = replacement;
      }

      violations.push(violation);
    }
  }

  violations.sort((a, b) => a.index - b.index || b.endIndex - a.endIndex);
  const selectedViolations = selectNonOverlappingViolations(violations);

  return {
    ok: selectedViolations.length === 0,
    text,
    locale: options.locale,
    violations: selectedViolations,
  };
}

export function sanitizeTextWithRules(
  text: string,
  bannedWords: readonly BannedWordRule[],
  replacements: readonly ReplacementRule[],
  options: ResolvedTextPolicyOptions,
): SanitizedText {
  const mode = options.mode ?? "replace";
  const mask = options.mask ?? DEFAULT_MASK;
  const replacementChanges = selectNonOverlappingChanges(
    collectReplacementChanges(
      text,
      replacements,
      options.locale,
    ),
  );

  let result = applyChanges(text, replacementChanges);
  const report = checkTextWithRules(result, bannedWords, options);
  const bannedChanges: ReplacementChange[] = [];

  if (!report.ok && mode === "throw") {
    throw new Error(formatPolicyError(report.violations));
  }

  if (mode !== "keep") {
    for (const violation of report.violations) {
      const to = replacementForMode(violation, mode, mask);

      if (to === undefined) {
        continue;
      }

      bannedChanges.push({
        ruleId: violation.ruleId,
        from: violation.match,
        to,
        index: violation.index,
        endIndex: violation.endIndex,
        locale: options.locale,
        kind: "banned-word",
      });
    }

    result = applyChanges(result, bannedChanges);
  }

  return {
    text: result,
    changed: text !== result,
    locale: options.locale,
    violations: report.violations,
    replacements: [...replacementChanges, ...bannedChanges],
  };
}

function matchesLocale(ruleLocale: Locale | Locale[] | undefined, locale: Locale): boolean {
  if (ruleLocale === undefined) {
    return true;
  }

  const locales = Array.isArray(ruleLocale) ? ruleLocale : [ruleLocale];
  return locales.includes(locale);
}

function createMatcher(
  pattern: RulePattern,
  options: { matchCase?: boolean; wholeWord?: boolean },
): RegExp {
  if (pattern instanceof RegExp) {
    const flags = normalizeRegexFlags(pattern.flags);
    return new RegExp(pattern.source, flags);
  }

  const escaped = normalizeApostrophes(escapeRegExp(pattern));
  const source = options.wholeWord ? `(?<!${WORD_BOUNDARY})${escaped}(?!${WORD_BOUNDARY})` : escaped;
  const flags = `gu${options.matchCase ? "" : "i"}`;
  return new RegExp(source, flags);
}

function matcherOptions(rule: { matchCase?: boolean; wholeWord?: boolean }): { matchCase?: boolean; wholeWord?: boolean } {
  const options: { matchCase?: boolean; wholeWord?: boolean } = {};

  if (rule.matchCase !== undefined) {
    options.matchCase = rule.matchCase;
  }

  if (rule.wholeWord !== undefined) {
    options.wholeWord = rule.wholeWord;
  }

  return options;
}

function normalizeRegexFlags(flags: string): string {
  const unique = new Set(flags);
  unique.add("g");
  return [...unique].join("");
}

function matchAllWithIndex(text: string, matcher: RegExp): Array<{ value: string; index: number }> {
  const matches: Array<{ value: string; index: number }> = [];

  for (const match of text.matchAll(matcher)) {
    if (match.index === undefined || match[0] === "") {
      continue;
    }

    matches.push({ value: match[0], index: match.index });
  }

  return matches;
}

function collectReplacementChanges(
  text: string,
  rules: readonly ReplacementRule[],
  locale: Locale,
): ReplacementChange[] {
  const changes: ReplacementChange[] = [];

  for (const rule of rules) {
    if (!matchesLocale(rule.locale, locale)) {
      continue;
    }

    const matcher = createMatcher(rule.from, matcherOptions(rule));

    for (const match of matchAllWithIndex(text, matcher)) {
      const ruleId = rule.id ?? patternId(rule.from);
      const resolved = resolveReplacement(rule.to, match.value, {
        locale,
        ruleId,
        index: match.index,
        input: text,
      });

      changes.push({
        ruleId,
        from: match.value,
        to: rule.preserveCase ? preserveCase(match.value, resolved ?? match.value) : resolved ?? match.value,
        index: match.index,
        endIndex: match.index + match.value.length,
        locale,
        kind: "replacement",
      });
    }
  }

  return changes.sort((a, b) => a.index - b.index || b.endIndex - a.endIndex);
}

function applyChanges(text: string, changes: readonly ReplacementChange[]): string {
  const selected = selectNonOverlappingChanges(changes);
  let result = "";
  let cursor = 0;

  for (const change of selected) {
    result += text.slice(cursor, change.index);
    result += change.to;
    cursor = change.endIndex;
  }

  result += text.slice(cursor);
  return result;
}

function selectNonOverlappingChanges(changes: readonly ReplacementChange[]): ReplacementChange[] {
  const selected: ReplacementChange[] = [];
  let cursor = 0;

  for (const change of changes) {
    if (change.index < cursor) {
      continue;
    }

    selected.push(change);
    cursor = change.endIndex;
  }

  return selected;
}

function selectNonOverlappingViolations(violations: readonly BannedWordViolation[]): BannedWordViolation[] {
  const selected: BannedWordViolation[] = [];
  let cursor = 0;

  for (const violation of violations) {
    if (violation.index < cursor) {
      continue;
    }

    selected.push(violation);
    cursor = violation.endIndex;
  }

  return selected;
}

function replacementForMode(
  violation: BannedWordViolation,
  mode: SanitizeMode,
  mask: string,
): string | undefined {
  if (mode === "replace") {
    return violation.replacement ?? mask.repeat([...violation.match].length);
  }

  if (mode === "mask") {
    return mask.repeat([...violation.match].length);
  }

  if (mode === "remove") {
    return "";
  }

  return undefined;
}

function resolveReplacement(
  replacement: ReplacementRule["to"] | BannedWordRule["replacement"] | undefined,
  match: string,
  context: ReplacementContext,
): string | undefined {
  if (replacement === undefined) {
    return undefined;
  }

  return typeof replacement === "function" ? replacement(match, context) : replacement;
}

function preserveCase(source: string, replacement: string): string {
  if (source.toUpperCase() === source) {
    return replacement.toUpperCase();
  }

  const first = source[0];

  if (first && first.toUpperCase() === first) {
    return `${replacement.slice(0, 1).toUpperCase()}${replacement.slice(1)}`;
  }

  return replacement;
}

function patternId(pattern: RulePattern): string {
  return pattern instanceof RegExp ? pattern.toString() : pattern;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Make a (regex-escaped) pattern treat straight and curly apostrophes as
 * interchangeable, so a phrase authored with one form still matches copy that
 * uses the other.
 */
function normalizeApostrophes(source: string): string {
  return source.replace(/['‘’]/gu, "['‘’]");
}

function formatPolicyError(violations: readonly BannedWordViolation[]): string {
  const details = violations
    .map((violation) => `${violation.ruleId} at ${violation.index}`)
    .join(", ");
  return `Banned words found: ${details}`;
}
