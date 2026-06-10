import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import pl from './locales/pl.json';
import hr from './locales/hr.json';
import cs from './locales/cs.json';
import sk from './locales/sk.json';
import sl from './locales/sl.json';
import bg from './locales/bg.json';
import hu from './locales/hu.json';
import ro from './locales/ro.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  de: { translation: de },
  fr: { translation: fr },
  pt: { translation: pt },
  it: { translation: it },
  pl: { translation: pl },
  hr: { translation: hr },
  cs: { translation: cs },
  sk: { translation: sk },
  sl: { translation: sl },
  bg: { translation: bg },
  hu: { translation: hu },
  ro: { translation: ro },
};

// Keep <html lang> in sync with the active locale. index.html ships a
// static lang="en", which made Chrome on Android treat fully-German
// pages as English and AUTO-TRANSLATE them — turning the German
// placeholder "Tipper" into "Kipper" (tipper truck) on a customer's
// phone, who then reported a wrong-name bug (SCHÄFER Werke, June 2026).
// Declaring the real language stops the auto-translate prompt for
// matching-language users entirely. Listeners attached before init so
// the 'initialized' event is not missed.
const syncHtmlLang = (lng: string | undefined) => {
  if (typeof document !== 'undefined' && lng) {
    document.documentElement.lang = lng;
  }
};
i18n.on('initialized', () => syncHtmlLang(i18n.resolvedLanguage ?? i18n.language));
i18n.on('languageChanged', (lng) => syncHtmlLang(lng));

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: [
      'en', 'es', 'de', 'fr', 'pt', 'it',
      // June 2026: Central / Eastern European tenants. Each locale was
      // built by deep-merging a per-language overrides table on top of
      // the English base (see scripts that lived at /tmp/build-locales.py
      // when this batch landed), so any string the override table didn't
      // cover automatically falls back to English at runtime without
      // exploding into untranslated-key references.
      'pl', 'hr', 'cs', 'sk', 'sl', 'bg', 'hu', 'ro',
    ],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;
