/**
 * EmbedPDF's own strings, such as the standard commands' labels, in the eight
 * languages of the standard stamps. They sit under the app's strings: a key
 * the app gives a string replaces EmbedPDF's (`addTranslations` under the same
 * key), and they show only in a language the app has loaded.
 */
import type { TranslationDictionary } from '../contract';
import { negotiateLocale } from '../negotiate';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { ja } from './ja';
import { nl } from './nl';
import { sv } from './sv';
import { zhCN } from './zh-cn';

const EMBEDPDF_STRINGS: Readonly<Record<string, TranslationDictionary>> = {
  en,
  nl,
  de,
  fr,
  es,
  'zh-CN': zhCN,
  sv,
  ja,
};

const CODES = Object.keys(EMBEDPDF_STRINGS);

/** Which of EmbedPDF's languages each code reads, decided once per code. */
const languageOf = new Map<string, string | null>();

/**
 * EmbedPDF's strings for a language code, matched as `negotiateLocale` matches: `nl-BE` reads
 * Dutch and `zh` Simplified Chinese. `undefined` for a language EmbedPDF has no strings in.
 */
export function embedpdfStringsFor(code: string): TranslationDictionary | undefined {
  let language = languageOf.get(code);
  if (language === undefined) {
    language = negotiateLocale(CODES, [code]);
    languageOf.set(code, language);
  }
  return language === null ? undefined : EMBEDPDF_STRINGS[language];
}
