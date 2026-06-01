import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkText,
  checkViteSocialTranslations,
  createStakeEngineSocialModeConfig,
  createI18n,
  createReactI18n,
  createSvelteI18n,
  createViteI18nPlugin,
  defineI18nConfig,
  isStakeEngineSocialMode,
  loadI18nConfig,
  mergeI18nConfig,
  plural,
  resolveStakeEngineLocale,
  sanitizeText,
  select,
  socialBannedWordsPreset,
} from "../dist/index.js";

test("translates string, nested, descriptor, fallback, and function messages", () => {
  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "ru",
    catalogs: {
      en: {
        hello: "Hello {name}",
        nested: {
          title: "Nested {{name}}",
        },
        inbox: (values, context) =>
          plural(Number(values.count), {
            one: "{count} message",
            other: "{count} messages",
          }, context.locale, values),
        gender: (values) =>
          select(values.gender, {
            male: "He won",
            female: "She won",
            other: "They won",
          }),
      },
      ru: {
        fallback: "Fallback {name}",
      },
    },
  });

  assert.equal(i18n.t("hello", { name: "Alex" }), "Hello Alex");
  assert.equal(i18n.t("nested.title", { name: "Alex" }), "Nested Alex");
  assert.equal(i18n.t({ id: "missing", message: "Default {name}" }, { name: "Alex" }), "Default Alex");
  assert.equal(i18n.t("fallback", { name: "Alex" }), "Fallback Alex");
  assert.equal(i18n.t("inbox", { count: 2 }), "2 messages");
  assert.equal(i18n.t("gender", { gender: "female" }), "She won");
  assert.equal(i18n.has("hello"), true);
  assert.equal(i18n.has("nope"), false);
});

test("formats named number and date presets", () => {
  const i18n = createI18n({
    locale: "en-US",
    formats: {
      numbers: {
        money: { style: "currency", currency: "USD" },
      },
      dates: {
        short: { dateStyle: "short", timeZone: "UTC" },
      },
    },
  });

  assert.equal(i18n.formatNumber(12, "money"), "$12.00");
  assert.equal(i18n.formatDate(new Date("2026-05-09T00:00:00.000Z"), "short"), "5/9/26");
});

test("checks banned social words and sanitizes with automatic replacements", () => {
  const i18n = createI18n({
    locale: "en",
    bannedWords: socialBannedWordsPreset,
    replacements: createStakeEngineSocialModeConfig({ social: true }).replacements,
  });

  const report = i18n.checkText("Place your bets and buy bonus at the cost of 10 money.");
  assert.equal(report.ok, false);
  assert.deepEqual(report.violations.map((violation) => violation.ruleId), [
    "stake.social.place.your.bets",
    "stake.social.buy.bonus",
    "stake.social.at.the.cost.of",
    "stake.social.money",
  ]);

  const sanitized = i18n.sanitizeText("Place your bets and buy bonus at the cost of 10 money.");
  assert.equal(
    sanitized.text,
    "Come and play / join in the game and get bonus for 10 coins.",
  );
  assert.equal(sanitized.changed, true);
  assert.equal(sanitized.replacements.length, 4);
});

test("checks and sanitizes full translation catalogs", () => {
  const i18n = createI18n({
    locale: "en",
    ...createStakeEngineSocialModeConfig({ social: true }),
  });

  const catalog = {
    home: {
      title: "Total bet and pay table",
      cta: "Deposit money",
    },
    dynamic: () => "Total bet",
  };

  const report = i18n.checkCatalog(catalog);
  assert.equal(report.ok, false);
  assert.equal(report.checkedMessages, 2);
  assert.equal(report.skippedMessages, 1);
  assert.deepEqual(report.violations.map((violation) => `${violation.messageId}:${violation.ruleId}`), [
    "home.title:stake.social.total.bet",
    "home.title:stake.social.pay.table",
    "home.cta:stake.social.deposit",
    "home.cta:stake.social.money",
  ]);

  const sanitized = i18n.sanitizeCatalog(catalog);
  assert.equal(sanitized.changed, true);
  assert.equal(sanitized.checkedMessages, 2);
  assert.equal(sanitized.skippedMessages, 1);
  assert.deepEqual(sanitized.catalog.home, {
    title: "Total play and win table",
    cta: "Get coins coins",
  });
  assert.equal(typeof sanitized.catalog.dynamic, "function");
});

test("resolves Stake Engine social=true mode to English regardless of lang", () => {
  assert.equal(isStakeEngineSocialMode("?social=true&lang=ru"), true);
  assert.equal(resolveStakeEngineLocale("?social=true&lang=ru"), "en");
  assert.equal(resolveStakeEngineLocale("?social=false&lang=ru"), "ru");

  const config = createStakeEngineSocialModeConfig({
    query: "?social=true&lang=ru",
    catalogs: {
      en: { title: "Total bet" },
      ru: { title: "Общая ставка" },
    },
  });
  const i18n = createI18n(config);

  assert.equal(i18n.locale, "en");
  // social mode auto-sanitizes t() output, so no manual sanitizeText is needed
  assert.equal(i18n.t("title"), "Total play");
  // sanitizing the already-clean result is a no-op
  assert.equal(i18n.sanitizeText(i18n.t("title")).text, "Total play");
});

test("social mode auto-sanitizes t() and supports whole-key overrides", () => {
  const i18n = createI18n(createStakeEngineSocialModeConfig({
    social: true,
    catalogs: {
      en: {
        greet: "Place your bets",
        deposit: "Deposit money now",
      },
    },
    socialOverrides: {
      deposit: "Get more coins now",
    },
  }));

  // word-by-word auto replacement, no manual sanitize call
  assert.equal(i18n.t("greet"), "Come and play / join in the game");
  // whole-key override replaces the awkward "Get coins coins now" auto result
  assert.equal(i18n.t("deposit"), "Get more coins now");
});

test("whole-word social replacement keeps bet and bets distinct and ignores substrings", () => {
  const i18n = createI18n(createStakeEngineSocialModeConfig({
    social: true,
    catalogs: {
      en: {
        bets: "bets",
        bet: "bet",
        mixed: "Total bet on 5 bets",
        substrings: "better alphabet Tibet",
        upper: "BETS",
        capital: "Bet",
      },
    },
  }));

  // the shorter "bet" rule must not corrupt the longer "bets"
  assert.equal(i18n.t("bets"), "plays");
  assert.equal(i18n.t("bet"), "play");
  assert.equal(i18n.t("mixed"), "Total play on 5 plays");
  // "bet" inside another word is left untouched by whole-word matching
  assert.equal(i18n.t("substrings"), "better alphabet Tibet");
  // preserveCase keeps the original casing of the matched word
  assert.equal(i18n.t("upper"), "PLAYS");
  assert.equal(i18n.t("capital"), "Play");
});

test("standalone sanitizeText and checkText default to the Stake social presets", () => {
  // zero-config: banned words and replacements are baked in
  assert.equal(sanitizeText("Total bet").text, "Total play");
  assert.equal(checkText("Total bet").ok, false);
  assert.equal(checkText("Hello world").ok, true);

  // rule sets can still be overridden per call
  const custom = sanitizeText("jackpot", {
    bannedWords: [{ id: "x", word: "jackpot", replacement: "top prize" }],
    replacements: [],
  });
  assert.equal(custom.text, "top prize");
});

test("createStakeEngineSocialModeConfig auto-reads window.location when query is omitted", () => {
  const had = "location" in globalThis;
  const original = globalThis.location;
  try {
    globalThis.location = { href: "https://game.example/?social=true&lang=ru" };
    const social = createStakeEngineSocialModeConfig({ catalogs: { en: { x: "Total bet" } } });
    assert.equal(social.locale, "en"); // social mode forces English
    assert.equal(social.autoSanitize, true);

    globalThis.location = { href: "https://game.example/?social=false&lang=ru" };
    const normal = createStakeEngineSocialModeConfig();
    assert.equal(normal.locale, "ru"); // non-social uses lang from the URL
    assert.equal(normal.autoSanitize, undefined);
  } finally {
    if (had) {
      globalThis.location = original;
    } else {
      delete globalThis.location;
    }
  }
});

test("auto-sanitize memoizes repeated output and invalidates on policy change", () => {
  let runs = 0;
  const i18n = createI18n({
    locale: "en",
    autoSanitize: true,
    catalogs: { en: { msg: "spin now" } },
    replacements: [
      { id: "count", from: "spin", to: () => { runs += 1; return "play"; }, wholeWord: true },
    ],
  });

  assert.equal(i18n.t("msg"), "play now");
  assert.equal(i18n.t("msg"), "play now");
  assert.equal(runs, 1, "identical output is sanitized once, then served from cache");

  i18n.addReplacements([{ id: "now", from: "now", to: "today", wholeWord: true }]);
  assert.equal(i18n.t("msg"), "play today", "cache is cleared so the new rule applies");
  assert.equal(runs, 2, "re-sanitized exactly once after invalidation");
});

test("autoSanitize is opt-in and off by default outside social mode", () => {
  const raw = createI18n({
    locale: "en",
    catalogs: { en: { copy: "Total bet" } },
    replacements: createStakeEngineSocialModeConfig({ social: true }).replacements,
  });
  assert.equal(raw.t("copy"), "Total bet");

  const auto = createI18n({
    locale: "en",
    autoSanitize: true,
    catalogs: { en: { copy: "Total bet" } },
    replacements: createStakeEngineSocialModeConfig({ social: true }).replacements,
  });
  assert.equal(auto.t("copy"), "Total play");
});

test("supports custom replacement dictionaries with locale scoping", () => {
  const i18n = createI18n({
    locale: "en",
    replacements: [
      {
        id: "copy.bonus",
        from: "bonus",
        to: "reward",
        wholeWord: true,
        preserveCase: true,
      },
      {
        id: "ru.telegram",
        from: "telegram",
        to: "messenger",
        locale: "ru",
        wholeWord: true,
      },
    ],
  });

  assert.equal(
    i18n.sanitizeText("Bonus bonus telegram").text,
    "Reward reward telegram",
  );

  i18n.setLocale("ru");
  assert.equal(i18n.sanitizeText("telegram").text, "messenger");
});

test("loads and merges object, json, ts, and js config modules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mi18n-"));
  const jsonPath = join(dir, "i18n.json");
  const tsPath = join(dir, "i18n.config.ts");
  const modulePath = join(dir, "i18n.config.mjs");

  await writeFile(
    jsonPath,
    JSON.stringify({
      catalogs: {
        en: {
          hello: "Hello {name}",
        },
      },
      replacements: [
        {
          id: "json.replace",
          from: "grey",
          to: "gray",
          wholeWord: true,
        },
      ],
    }),
  );

  await writeFile(
    tsPath,
    "const locale: string = 'en'; export default { locale, catalogs: { en: { fromTs: 'TS {name}' } } };",
  );

  await writeFile(
    modulePath,
    "export default { locale: 'en', catalogs: { ru: { hello: 'Privet {name}' } }, fallbackLocale: 'ru' };",
  );

  // Loading a TS module depends on runtime support (Node >= 23.6 or a loader);
  // skip just that input where the runtime cannot import .ts so the suite stays
  // portable on LTS Node.
  let tsSupported = true;
  try {
    await loadI18nConfig(tsPath);
  } catch (err) {
    if (err?.code !== "ERR_UNKNOWN_FILE_EXTENSION" && err?.name !== "SyntaxError") {
      throw err;
    }
    tsSupported = false;
  }

  const inputs = [
    defineI18nConfig({
      bannedWords: [
        {
          id: "test.block",
          word: "blocked",
          replacement: "allowed",
        },
      ],
    }),
    jsonPath,
    ...(tsSupported ? [tsPath] : []),
    modulePath,
  ];

  const config = await loadI18nConfig(inputs);

  const i18n = createI18n(config);
  assert.equal(i18n.t("hello", { name: "Alex" }), "Hello Alex");
  if (tsSupported) {
    assert.equal(i18n.t("fromTs", { name: "Alex" }), "TS Alex");
  } else {
    console.log("ℹ runtime cannot import .ts modules; skipped TS config assertion");
  }
  assert.equal(i18n.sanitizeText("grey blocked").text, "gray allowed");

  const merged = mergeI18nConfig(
    { catalogs: { en: { nested: { first: "1" } } } },
    { catalogs: { en: { nested: { second: "2" } } } },
  );
  assert.equal(merged.catalogs?.en?.nested && typeof merged.catalogs.en.nested === "object"
    ? merged.catalogs.en.nested.second
    : undefined, "2");
});

test("returns a stable snapshot reference until state changes", () => {
  const i18n = createI18n({ locale: "en" });

  const first = i18n.getSnapshot();
  assert.equal(i18n.getSnapshot(), first, "snapshot must be cached between calls");

  i18n.setLocale("ru");
  const afterChange = i18n.getSnapshot();
  assert.notEqual(afterChange, first, "snapshot must change after a state change");
  assert.equal(i18n.getSnapshot(), afterChange, "snapshot must be cached again");
  assert.equal(afterChange.locale, "ru");
});

test("rejects remote config specifiers", async () => {
  await assert.rejects(
    () => loadI18nConfig("https://example.com/i18n.json"),
    /Remote i18n config loading is not supported/,
  );
  await assert.rejects(
    () => loadI18nConfig("data:application/json,{}"),
    /Remote i18n config loading is not supported/,
  );
});

test("provides a Svelte-compatible readable store", () => {
  const i18n = createI18n({
    locale: "en",
    catalogs: {
      en: { hello: "Hello" },
      ru: { hello: "Privet" },
    },
  });
  const store = createSvelteI18n(i18n);
  const snapshots = [];
  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  assert.equal(store.t("hello"), "Hello");
  store.setLocale("ru");
  assert.equal(store.t("hello"), "Privet");
  unsubscribe();

  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].locale, "ru");
});

test("provides React bindings without requiring React as a package dependency", () => {
  const i18n = createI18n({ locale: "en" });
  const runtime = {
    createContext(defaultValue) {
      return { Provider: "Provider", _currentValue: defaultValue };
    },
    useContext(context) {
      return context._currentValue;
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot();
    },
    createElement(type, props, ...children) {
      return { type, props, children };
    },
  };

  const bindings = createReactI18n(i18n, runtime);
  assert.equal(bindings.useLocale(), "en");
  assert.equal(bindings.useT()("missing.key"), "missing.key");
  assert.deepEqual(bindings.I18nProvider({ children: "child" }), {
    type: "Provider",
    props: { value: i18n },
    children: ["child"],
  });
});

test("provides a Vite adapter that fails build-time social catalog checks", async () => {
  const plugin = createViteI18nPlugin({
    catalog: {
      rules: {
        title: "Total bet and pay table",
      },
    },
  });

  assert.equal(plugin.name, "@mnemoo/i18n/social-mode-check");
  assert.equal(plugin.apply, "build");

  await assert.rejects(
    () => plugin.buildStart(),
    /social mode check failed: 2 restricted phrase\(s\).*Total bet.*total play.*pay table.*win table/s,
  );
});

test("Vite social check can load catalogs from config and pass clean copy", async () => {
  const report = await checkViteSocialTranslations({
    config: {
      catalogs: {
        en: {
          rules: {
            title: "Total play and win table",
          },
        },
      },
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.catalogFound, true);
  assert.equal(report.checkedMessages, 1);
  assert.equal(report.violations.length, 0);
});

test("Vite social check reports a missing social catalog", async () => {
  const report = await checkViteSocialTranslations({
    config: {
      catalogs: {
        ru: {
          rules: "Общая ставка",
        },
      },
    },
  });

  assert.equal(report.ok, false);
  assert.equal(report.catalogFound, false);
});
