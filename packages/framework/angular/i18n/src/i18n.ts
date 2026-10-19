/**
 * The translations plugin's service, feature and pipe:
 *
 *   withI18n(options)        the plugin, for provideEmbedPdf()
 *   inject(EpdfI18n)         `locale()`, `direction()`, `locales()`, `loading()`, `setLocale()`, …
 *   {{ 'key' | epdfT }}      a string in the current language, updated when it changes
 *
 * The plugin needs no engine and no document, so a loading screen and a password prompt
 * translate too, as soon as the viewer exists.
 */
import { inject, Injectable, Pipe, type PipeTransform, type Signal } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  i18nPlugin,
  i18nState,
  I18nToken,
  type I18nConfig,
  type TranslateOptions,
} from '@embedpdf/plugin-i18n';

/** A translate function: `t('toolbar.save')`, `t('search.results', { params: { count } })`. */
export type Translate = (key: string, options?: TranslateOptions) => string;

/**
 * Before the viewer exists (a lazily loaded engine, or rendering on the server) there are no
 * strings yet: a string shows its `fallback`, else its key, as a key no language has does.
 */
const untranslated: Translate = (key, options) => options?.fallback ?? key;

/**
 * The languages: `locale()`, `direction()`, `locales()` and `loading()` as signals, `t()`,
 * `setLocale()`, `addTranslations()` and `registerLocale()`, `localeChanged$` and
 * `localeLoadFailed$`, and the settings. The plugin is the workspace's, so all of it works
 * before a document opens.
 */
@Injectable({ providedIn: 'root' })
export class EpdfI18n extends pluginService({
  name: 'EpdfI18n',
  feature: 'withI18n()',
  token: I18nToken,
  state: i18nState,
  methods: [
    't',
    'getTranslator',
    'hasKey',
    'getLocale',
    'getDirection',
    'listLocales',
    'getLoadingLocale',
    'setLocale',
    'registerLocale',
    'addTranslations',
  ],
  events: ['onLocaleChanged', 'onLocaleLoadFailed'],
}) {
  /**
   * The translate function as a signal: a new function when the language or the strings
   * change, the same one otherwise. What the `epdfT` pipe reads; a `computed()` that calls it
   * follows the language too.
   */
  readonly translator: Signal<Translate> = this.binding.select(
    (i18n) => i18n.getTranslator(),
    untranslated,
    Object.is,
  );
}

/** The translations plugin, with its settings: `withI18n({ locale, locales, loaders })`. */
export function withI18n(options?: I18nConfig): EmbedPdfFeature {
  return { plugins: [i18nPlugin(options)], services: [EpdfI18n] };
}

/**
 * A string in the current language: `{{ 'toolbar.save' | epdfT }}`, or with the options `t()`
 * takes, `{{ 'search.results' | epdfT: { params: { count } } }}`. It updates when the language
 * or the strings change.
 *
 * Not pure, because the language is not one of its arguments: it reads the translator signal
 * each time the template is checked, which is what wakes the template when the language
 * changes, and the translator keeps a looked-up string cheap.
 */
@Pipe({ name: 'epdfT', pure: false })
export class EpdfTPipe implements PipeTransform {
  private readonly i18n = inject(EpdfI18n);

  transform(key: string, options?: TranslateOptions): string {
    return this.i18n.translator()(key, options);
  }
}
