import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { english, Localization, resolveLocale, translate } from "../src/i18n";

test("Steam language takes priority; Chinese aliases and English fallback are deterministic", () => {
  for (const language of ["schinese", "tchinese", "zh-CN", "zh_TW", " ZH-hans "]) {
    assert.equal(resolveLocale(language, ["en-US"]), "zh-CN");
  }
  for (const language of ["english", "german", "japanese"]) {
    assert.equal(resolveLocale(language, ["zh-CN"]), "en");
  }
  assert.equal(resolveLocale(undefined, ["zh-CN", "en-US"]), "zh-CN");
  assert.equal(resolveLocale("", ["en-US", "zh-CN"]), "en");
  assert.equal(resolveLocale(null), "en");
});

test("the catalog covers UI, controller and backend status messages without losing unknown details", () => {
  for (const file of ["src/index.tsx", "src/controller.ts", "src/system-settings.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const [, message] of source.matchAll(/"([^"\n]*[\u3400-\u9fff][^"\n]*)"/g)) {
      assert(Object.prototype.hasOwnProperty.call(english, message), `${file}: missing translation for ${message}`);
    }
  }
  const backend = readFileSync(new URL("../py_modules/brightness_floor_backend.py", import.meta.url), "utf8");
  for (const [, message] of backend.matchAll(/(?:self\.error|result\["reason"\]) = "([^"]+)"/g)) {
    assert(Object.prototype.hasOwnProperty.call(english, message), `backend: missing translation for ${message}`);
  }
  for (const [message, translation] of Object.entries(english)) {
    assert.equal(translate(message, "zh-CN"), message);
    assert.equal(translate(message, "en"), translation);
    assert(!/[\u3400-\u9fff]/.test(translation), `untranslated English message: ${message}`);
  }
  assert.equal(translate("Unexpected API error: 123", "en"), "Unexpected API error: 123");
});

test("async Steam language updates mounted views and removes subscriptions on unload", async () => {
  const localization = new Localization(["zh-CN"]);
  let updates = 0;
  const unsubscribe = localization.subscribe(() => updates++);
  await localization.initialize({ GetCurrentLanguage: async () => "english" });
  assert.equal(localization.getSnapshot(), "en");
  assert.equal(updates, 1);
  unsubscribe();
  await localization.initialize({ GetCurrentLanguage: () => "schinese" });
  assert.equal(localization.getSnapshot(), "zh-CN");
  assert.equal(updates, 1);
  localization.dispose();
});

test("missing, throwing and rejected language APIs preserve the browser fallback", async () => {
  for (const settings of [undefined,
    { GetCurrentLanguage() { throw new Error("unavailable"); } },
    { GetCurrentLanguage: () => Promise.reject(new Error("unavailable")) },
    { GetCurrentLanguage: () => null }]) {
    const localization = new Localization(["zh-CN"]);
    await localization.initialize(settings);
    assert.equal(localization.getSnapshot(), "zh-CN");
    localization.dispose();
  }
});

test("timed out language calls cannot apply a late result", async () => {
  const localization = new Localization(["en-US"], 5);
  let respond!: (language: string) => void;
  const pending = localization.initialize({ GetCurrentLanguage: () => new Promise<string>(resolve => { respond = resolve; }) });
  await pending;
  respond("schinese");
  await Promise.resolve();
  assert.equal(localization.getSnapshot(), "en");
  localization.dispose();
});

test("unload cancels pending language initialization and prevents late view updates", async () => {
  const localization = new Localization(["zh-CN"], 60_000);
  let respond!: (language: string) => void;
  let updates = 0;
  localization.subscribe(() => updates++);
  const pending = localization.initialize({ GetCurrentLanguage: () => new Promise<string>(resolve => { respond = resolve; }) });
  await Promise.resolve();
  localization.dispose();
  await pending;
  respond("english");
  await Promise.resolve();
  assert.equal(localization.getSnapshot(), "zh-CN");
  assert.equal(updates, 0);
});
