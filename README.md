# @mnemoo/i18n

Strict TypeScript i18n toolkit with runtime translation catalogs, formatter helpers,
config loading, Svelte-compatible stores, React bindings, and built-in text policy
checks for Stake Engine social mode restricted phrases plus automatic replacement
dictionaries.

## Install

```sh
npm install @mnemoo/i18n
```

## Core TS API

```ts
import {
  createStakeEngineSocialModeConfig,
  createI18n,
  defineI18nConfig,
} from "@mnemoo/i18n";

const config = defineI18nConfig(createStakeEngineSocialModeConfig({
  query: "?social=true&lang=ru",
  catalogs: {
    en: {
      bonus: "Bonus costs {multiplier}x",
      nested: {
        hello: "Hello {name}",
      },
    },
    ru: {
      bonus: "Bonus costs {multiplier}x",
    },
  },
}));

const i18n = createI18n(config);

i18n.t("nested.hello", { name: "Alex" }); // "Hello Alex"
i18n.t("bonus", { multiplier: 300 }); // "Bonus costs 300x"

const report = i18n.checkText("Place your bets");
// report.ok === false

const clean = i18n.sanitizeText("Total bet and pay table");
// clean.text === "Total play and win table"
```

## Stake Engine Social Mode

Stake Engine sends social mode through the URL query parameter `social=true`.
The `lang` parameter is still sent, but social mode must use English copy and
replace restricted gambling phrases regardless of the incoming language.

In social mode `createStakeEngineSocialModeConfig` turns on `autoSanitize`, so
`t()` replaces restricted phrases on its own — you author the English catalog
once and never wrap calls in `sanitizeText`. Sanitizing already-clean copy is a
no-op, so it doubles as a safety net. Auto-sanitized output is memoized per
locale and text (the cache clears when policy rules change), so repeated `t()`
calls in render loops stay cheap.

```ts
import {
  createI18n,
  createStakeEngineSocialModeConfig,
  resolveStakeEngineLocale,
} from "@mnemoo/i18n";

resolveStakeEngineLocale("?social=true&lang=ru"); // "en"
resolveStakeEngineLocale("?social=false&lang=ru"); // "ru"

const i18n = createI18n(createStakeEngineSocialModeConfig({
  query: "?social=true&lang=ru",
  catalogs: {
    en: {
      rules: "Total bet is shown in the pay table",
    },
    ru: {
      rules: "Ignored in social mode",
    },
  },
}));

i18n.locale; // "en"
i18n.t("rules");
// "Total play is shown in the win table" (auto-sanitized in social mode)
```

`createStakeEngineSocialModeConfig` reads `window.location.href` by default, so
in the browser you can omit `query` entirely and it still detects `social` and
`lang`:

```ts
// URL: https://your.game/?social=true&lang=ru
const i18n = createI18n(
  createStakeEngineSocialModeConfig({ catalogs: { en: { rules: "Total bet" } } }),
);
i18n.t("rules"); // "Total play" — social mode, restricted phrases auto-replaced
```

Under SSR/Node (no `window.location`) it falls back to non-social English copy.
Pass `query`, `social`, or `lang` explicitly to override the ambient read.

When word-by-word replacement reads badly for a specific message, override the
whole key with `socialOverrides`. Overrides win over the English catalog in
social mode only and are still run through the sanitizer as a safety net, so a
clean rewrite shows verbatim:

```ts
const i18n = createI18n(createStakeEngineSocialModeConfig({
  query: "?social=true",
  catalogs: {
    en: { deposit: "Deposit money now" },
  },
  socialOverrides: {
    // without this, auto replacement yields the awkward "Get coins coins now"
    deposit: "Get more coins now",
  },
}));

i18n.t("deposit"); // "Get more coins now"
```

The complete Stake Engine social-mode list ships as the
`stakeEngineSocialRestrictedPhrases` constant (35 phrases) and is the source of
truth. A representative subset:

| Restricted Phrase | Replacement |
| --- | --- |
| `bet` | `play` |
| `bets` | `plays` |
| `betting` | `playing` |
| `bonus buy` | `bonus / feature` |
| `buy bonus` | `get bonus` |
| `cash` | `coins` |
| `deposit` | `get coins` |
| `money` | `coins` |
| `pay table` | `win table` |
| `place your bets` | `come and play / join in the game` |
| `stake` | `play amount` |
| `total bet` | `total play` |
| `withdraw` | `redeem` |

> **Auto-replacement is lossy on broad terms.** Common single words such as
> `bet`, `buy`, `pay`, `cash`, `credit`, and `money` are matched whole-word, so
> `sanitizeText`/`sanitizeCatalog` — and `t()` once `autoSanitize` is on —
> rewrite ordinary copy too, for example "Pay attention" becomes "Win
> attention". Keep the build-time **check** (the Vite plugin below) plus human
> review in the loop, and use `socialOverrides` to hand-write any message the
> blanket rules mangle.

## Standalone Text Sanitizer

To sanitize or check a single string without building an `I18n` instance, use the
top-level `sanitizeText` and `checkText`. Banned words and replacements default to
the Stake Engine social-mode presets, so the common case needs no configuration:

```ts
import { sanitizeText, checkText } from "@mnemoo/i18n";

sanitizeText("Total bet").text;      // "Total play"
checkText("Total bet").ok;           // false
checkText("Welcome to the game").ok; // true
```

Pass `bannedWords`/`replacements` to override the defaults, or `mode`
(`"replace"` by default) to mask or remove instead of replacing:

```ts
sanitizeText("jackpot", {
  bannedWords: [{ word: "jackpot", replacement: "top prize" }],
}).text; // "top prize"
```

## Catalog Policy Checks

Run the same banned-word and replacement pipeline across a full translation
catalog. String messages are checked and sanitized recursively; function
messages are preserved and reported as skipped because they are runtime code.

```ts
const catalog = {
  home: {
    title: "Total bet and pay table",
    cta: "Deposit money",
  },
};

const report = i18n.checkCatalog(catalog);
// report.violations[0].messageId === "home.title"

const sanitized = i18n.sanitizeCatalog(catalog);
// sanitized.catalog.home.title === "Total play and win table"
```

## Banned Words And Replacements

Use `bannedWords` for policy checks and `replacements` for copy normalization.
Both can be loaded from TS config, JSON config, or added at runtime.

```ts
const i18n = createI18n({
  locale: "en",
  bannedWords: [
    {
      id: "social.custom",
      word: "jackpot",
      replacement: "top prize",
    },
  ],
  replacements: [
    {
      id: "terms.bonus",
      from: "bonus buy",
      to: "bonus / feature",
      wholeWord: true,
      preserveCase: true,
    },
  ],
});

i18n.checkText("jackpot");
i18n.sanitizeText("Bonus buy jackpot");
```

Sanitizing modes:

- `replace`: use rule replacements, otherwise mask.
- `mask`: always mask banned matches.
- `remove`: remove banned matches.
- `keep`: return replacement dictionary changes only.
- `throw`: throw when banned matches are found.

## Config Files

TS/JS config:

```ts
// i18n.config.ts
import { defineI18nConfig, socialBannedWordsPreset } from "@mnemoo/i18n";

export default defineI18nConfig({
  locale: "en",
  fallbackLocale: ["ru", "en"],
  catalogs: {
    en: {
      hello: "Hello {name}",
    },
  },
  bannedWords: socialBannedWordsPreset,
});
```

JSON config:

```json
{
  "locale": "en",
  "catalogs": {
    "en": {
      "hello": "Hello {name}"
    }
  },
  "replacements": [
    {
      "id": "copy.grey",
      "from": "grey",
      "to": "gray",
      "wholeWord": true
    }
  ]
}
```

Load and merge configs:

```ts
import { createI18nFromConfig, loadI18nConfig } from "@mnemoo/i18n";

const config = await loadI18nConfig([
  "./i18n.json",
  "./i18n.config.js",
  {
    replacements: [{ from: "cashout", to: "cash out" }],
  },
]);

const i18n = await createI18nFromConfig(config);
```

`loadI18nConfig` accepts config objects, promises, factories, local JSON files,
local JS/TS module specifiers supported by the runtime, and arrays of configs.
Remote specifiers (HTTP(S) and `data:` URLs) are intentionally rejected so config
is only ever read from the bundle or local files. Later configs override scalar
options and merge catalogs, replacement rules, and banned-word rules.

## Message Helpers

```ts
import { createI18n, plural, select } from "@mnemoo/i18n";

const i18n = createI18n({
  locale: "en",
  catalogs: {
    en: {
      inbox: (values, context) =>
        plural(Number(values.count), {
          one: "{count} message",
          other: "{count} messages",
        }, context.locale, values),
      winner: (values) =>
        select(values.gender, {
          male: "He won",
          female: "She won",
          other: "They won",
        }),
    },
  },
});
```

## Vite Build Check

Use `createViteI18nPlugin` in `vite.config.ts` to fail `vite build` when the
English social-mode catalog still contains restricted Stake Engine phrases.
The plugin has no hard dependency on Vite types.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { createViteI18nPlugin } from "@mnemoo/i18n";
import i18nConfig from "./i18n.config";

export default defineConfig({
  plugins: [
    createViteI18nPlugin({
      config: i18nConfig,
      locale: "en",
    }),
  ],
});
```

You can also pass the social catalog directly:

```ts
createViteI18nPlugin({
  catalog: {
    rules: {
      title: "Total play and win table",
    },
  },
});
```

When a restricted phrase is found, the build error includes the message id,
matched text, approved replacement, and rule id:

```txt
@mnemoo/i18n social mode check failed: 2 restricted phrase(s) found in locale "en".
- rules.title: "Total bet" -> "total play" (stake.social.total.bet)
- rules.title: "pay table" -> "win table" (stake.social.pay.table)
```

## Svelte 5

`createSvelteI18n` returns a Svelte-readable store shape. It does not require a
runtime dependency on Svelte, so it works with Svelte 5 stores and runes helpers.

```ts
// i18n.ts
import { createI18n, createSvelteI18n } from "@mnemoo/i18n";

export const i18n = createI18n({
  locale: "en",
  catalogs: {
    en: { hello: "Hello {name}" },
    ru: { hello: "Privet {name}" },
  },
});

export const i18nStore = createSvelteI18n(i18n);
```

```svelte
<script lang="ts">
  import { i18nStore } from "./i18n";
</script>

<button onclick={() => i18nStore.setLocale("ru")}>
  {$i18nStore.t("hello", { name: "Alex" })}
</button>
```

## React

React is not bundled. Pass the React runtime to create structural bindings.

```tsx
import * as React from "react";
import { createI18n, createReactI18n } from "@mnemoo/i18n";

const i18n = createI18n({
  locale: "en",
  catalogs: {
    en: { hello: "Hello {name}" },
  },
});

export const { I18nProvider, useT, useLocale } = createReactI18n(i18n, React);

function App() {
  const t = useT();
  const locale = useLocale();

  return <div data-locale={locale}>{t("hello", { name: "Alex" })}</div>;
}

export function Root() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}
```

## Runtime Compatibility

The package is ESM-only and browser-safe. It performs no eager `eval`/`Function`
construction at import time, so it loads under strict CSP (`script-src` without
`'unsafe-eval'`). The Node-only file APIs that `loadI18nConfig` uses for local
config files are imported lazily, and only when you pass a file path, so bundlers
(Vite, Rollup, esbuild, webpack) never try to resolve `node:` modules for browser
targets. Inline `createI18n({ ... })` configs need no Node APIs at all.

## Development

```sh
npm run check
npm test
npm pack --dry-run
```
