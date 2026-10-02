import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { commandsPlugin, standardCommands, useCommand } from '@embedpdf/react/commands';
import { i18nPlugin, useI18n, useI18nState, useT } from '@embedpdf/react/i18n';
import type { Locale } from '@embedpdf/react/i18n';
import { localEngine } from '@embedpdf/engine';

import './basic.css';

const engine = localEngine();

// Your strings. The buttons' labels are the standard commands', which come translated.
const en: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    app: { language: 'Language', pages: { one: '{count} page', other: '{count} pages' } },
  },
};
const nl: Locale = {
  code: 'nl',
  name: 'Nederlands',
  translations: {
    app: { language: 'Taal', pages: { one: '{count} pagina', other: "{count} pagina's" } },
  },
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  commandsPlugin({ commands: standardCommands }),
  i18nPlugin({
    locale: 'nl',
    locales: [en, nl],
    // Loaded the first time someone picks them; in your app, `() => import('./locales/de')`.
    loaders: {
      de: async () => ({
        code: 'de',
        name: 'Deutsch',
        translations: {
          app: { language: 'Sprache', pages: { one: '{count} Seite', other: '{count} Seiten' } },
        },
      }),
      ja: async () => ({
        code: 'ja',
        name: '日本語',
        translations: { app: { language: '言語', pages: { other: '{count} ページ' } } },
      }),
    },
  }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function LanguagePicker() {
  const i18n = useI18n();
  const t = useT();
  const { locale, locales, loading } = useI18nState();

  return (
    <label className="picker">
      {t('app.language')}
      <select
        className="select"
        value={locale}
        disabled={loading !== null}
        onChange={(event) => void i18n.setLocale(event.target.value)}
      >
        {locales.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CommandButton({ id }: { id: string }) {
  const command = useCommand(id);
  if (!command?.visible) return null;

  return (
    <button type="button" className="button" disabled={!command.enabled} onClick={command.run}>
      {command.label}
    </button>
  );
}

function PageCount() {
  const t = useT();
  const { pageCount } = useStageState();
  return <output className="count">{t('app.pages', { params: { count: pageCount } })}</output>;
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">…</p>}>
        <div className="toolbar">
          <LanguagePicker />
          <CommandButton id="page:previous" />
          <CommandButton id="page:next" />
          <CommandButton id="zoom:in" />
          <CommandButton id="document:print" />
          <PageCount />
        </div>
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
