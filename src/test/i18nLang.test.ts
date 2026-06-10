// Regression guard for the Chrome auto-translate incident (SCHÄFER
// Werke, June 2026): index.html shipped a hardcoded lang="en", so Chrome
// machine-translated fully-German pages — turning the profile
// placeholder "Tipper" into "Kipper" and triggering a wrong-name support
// ticket. The i18n config now mirrors the active locale onto
// <html lang>; this test pins that behaviour.
import { describe, it, expect } from "vitest";
import i18n from "@/i18n/config";

describe("i18n <html lang> sync", () => {
  it("sets document lang on init", async () => {
    // config.ts kicks off init at import time; wait for it to settle.
    if (!i18n.isInitialized) {
      await new Promise<void>((resolve) => i18n.on("initialized", () => resolve()));
    }
    expect(document.documentElement.lang).toBe(i18n.resolvedLanguage ?? i18n.language);
  });

  it("follows language changes", async () => {
    await i18n.changeLanguage("de");
    expect(document.documentElement.lang).toBe("de");

    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
