import type {
  CatalogPolicyViolation,
  MessageCatalog,
  MessageFormatter,
  MessageNode,
  ReplacementChange,
  SanitizedCatalog,
  SanitizedText,
} from "./types.js";

export type CatalogWalkEntry =
  | { kind: "message"; id: string; value: string }
  | { kind: "skipped"; id: string };

export function getCatalogMessage(catalog: MessageCatalog, id: string): string | MessageFormatter | undefined {
  const direct = catalog[id];

  if (isMessage(direct)) {
    return direct;
  }

  const parts = id.split(".");
  let current: MessageNode | undefined = catalog;

  for (const part of parts) {
    if (!isCatalog(current)) {
      return undefined;
    }

    current = current[part];
  }

  return isMessage(current) ? current : undefined;
}

export function walkCatalog(catalog: MessageCatalog, path: readonly string[] = []): CatalogWalkEntry[] {
  const entries: CatalogWalkEntry[] = [];

  for (const [key, value] of Object.entries(catalog)) {
    const nextPath = [...path, key];
    const id = nextPath.join(".");

    if (typeof value === "string") {
      entries.push({ kind: "message", id, value });
      continue;
    }

    if (isCatalog(value)) {
      entries.push(...walkCatalog(value, nextPath));
      continue;
    }

    // Function messages are runtime code; null/invalid nodes are tolerated and skipped.
    entries.push({ kind: "skipped", id });
  }

  return entries;
}

export function sanitizeCatalogNode(
  catalog: MessageCatalog,
  sanitize: (id: string, value: string) => { id: string; result: SanitizedText },
  path: readonly string[] = [],
): Omit<SanitizedCatalog, "locale"> {
  const output: MessageCatalog = {};
  let changed = false;
  let checkedMessages = 0;
  let skippedMessages = 0;
  const replacements: Array<ReplacementChange & { messageId: string }> = [];
  const violations: CatalogPolicyViolation[] = [];

  for (const [key, value] of Object.entries(catalog)) {
    const nextPath = [...path, key];
    const id = nextPath.join(".");

    if (typeof value === "string") {
      const sanitized = sanitize(id, value);
      checkedMessages += 1;
      output[key] = sanitized.result.text;
      changed = changed || sanitized.result.changed;

      for (const replacement of sanitized.result.replacements) {
        replacements.push({ ...replacement, messageId: sanitized.id });
      }

      for (const violation of sanitized.result.violations) {
        violations.push({ ...violation, messageId: sanitized.id });
      }

      continue;
    }

    if (isCatalog(value)) {
      const nested = sanitizeCatalogNode(value, sanitize, nextPath);
      output[key] = nested.catalog;
      changed = changed || nested.changed;
      checkedMessages += nested.checkedMessages;
      skippedMessages += nested.skippedMessages;
      replacements.push(...nested.replacements);
      violations.push(...nested.violations);
      continue;
    }

    // Function messages are runtime code; null/invalid nodes are tolerated. Preserve and skip.
    output[key] = value;
    skippedMessages += 1;
  }

  return {
    catalog: output,
    changed,
    checkedMessages,
    skippedMessages,
    replacements,
    violations,
  };
}

export function mergeCatalogs(base: MessageCatalog, next: MessageCatalog): MessageCatalog {
  const result: MessageCatalog = { ...base };

  for (const [key, value] of Object.entries(next)) {
    const current = result[key];

    if (isCatalog(current) && isCatalog(value)) {
      result[key] = mergeCatalogs(current, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function isMessage(value: MessageNode | undefined): value is string | MessageFormatter {
  return typeof value === "string" || typeof value === "function";
}

function isCatalog(value: MessageNode | undefined): value is MessageCatalog {
  return typeof value === "object" && value !== null;
}
