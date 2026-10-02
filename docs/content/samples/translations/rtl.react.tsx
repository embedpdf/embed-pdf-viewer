import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { commandsPlugin, standardCommands, useCommand } from '@embedpdf/react/commands';
import { i18nPlugin, useI18n, useI18nState, useT } from '@embedpdf/react/i18n';
import type { Locale } from '@embedpdf/react/i18n';
import { localEngine } from '@embedpdf/engine';

import './rtl.css';

const engine = localEngine();

const en: Locale = {
  code: 'en',
  name: 'English',
  translations: { app: { title: 'The ebook', switchTo: 'العربية' } },
};
// Arabic reads right to left. The standard commands have no Arabic labels, so the app gives
// them, under the same keys.
const ar: Locale = {
  code: 'ar',
  name: 'العربية',
  direction: 'rtl',
  translations: {
    app: { title: 'الكتاب الإلكتروني', switchTo: 'English' },
    commands: {
      page: { previous: 'الصفحة السابقة', next: 'الصفحة التالية' },
      zoom: { in: 'تكبير', out: 'تصغير' },
    },
  },
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  commandsPlugin({ commands: standardCommands }),
  i18nPlugin({ locale: 'ar', locales: [en, ar] }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

function CommandButton({ id }: { id: string }) {
  const command = useCommand(id);
  if (!command?.visible) return null;

  return (
    <button type="button" className="button" disabled={!command.enabled} onClick={command.run}>
      {command.label}
    </button>
  );
}

// The toolbar follows the language: in Arabic it runs from right to left.
function ViewerRoot() {
  const i18n = useI18n();
  const t = useT();
  const { direction, locale } = useI18nState();

  return (
    <div dir={direction} className="root">
      <div className="toolbar">
        <strong className="title">{t('app.title')}</strong>
        <CommandButton id="page:previous" />
        <CommandButton id="page:next" />
        <CommandButton id="zoom:out" />
        <CommandButton id="zoom:in" />
        <button
          type="button"
          className="button switch"
          onClick={() => void i18n.setLocale(locale === 'ar' ? 'en' : 'ar')}
        >
          {t('app.switchTo')}
        </button>
      </div>
      <Stage className="stage">{() => <RenderLayer />}</Stage>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">…</p>}>
        <ViewerRoot />
      </DocumentGate>
    </Viewer>
  );
}
