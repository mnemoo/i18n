import test from "node:test";
import assert from "node:assert/strict";

import { composeI18nModules, defineI18nModule } from "../dist/index.js";

test("composes namespaced and un-namespaced modules into one t() endpoint", () => {
  const bet = defineI18nModule({
    namespace: "bet",
    catalogs: {
      en: { spin: "Spin", panel: { max: "Max bet" } },
      ru: { spin: "Крутить" },
    },
  });

  const wallet = defineI18nModule({
    catalogs: {
      en: { wallet: { balance: "Balance" } },
    },
  });

  const i18n = composeI18nModules([bet, wallet], { locale: "en", fallbackLocale: "en" });

  assert.equal(i18n.t("bet.spin"), "Spin");
  assert.equal(i18n.t("bet.panel.max"), "Max bet");
  assert.equal(i18n.t("wallet.balance"), "Balance");

  i18n.setLocale("ru");
  assert.equal(i18n.t("bet.spin"), "Крутить");
  // ru lacks the key, so the en fallback fills it in
  assert.equal(i18n.t("bet.panel.max"), "Max bet");
});

test("two modules extend the same namespace without clobbering", () => {
  const core = defineI18nModule({ namespace: "bet", catalogs: { en: { spin: "Spin" } } });
  const extra = defineI18nModule({ namespace: "bet", catalogs: { en: { max: "Max" } } });

  const i18n = composeI18nModules([core, extra]);

  assert.equal(i18n.t("bet.spin"), "Spin");
  assert.equal(i18n.t("bet.max"), "Max");
});

test("modules contribute replacement rules to the shared runtime", () => {
  const promo = defineI18nModule({
    namespace: "promo",
    catalogs: { en: { copy: "grey bonus" } },
    replacements: [{ id: "grey", from: "grey", to: "gray", wholeWord: true }],
  });

  const i18n = composeI18nModules([promo]);
  assert.equal(i18n.sanitizeText(i18n.t("promo.copy")).text, "gray bonus");
});
