import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { Font, FontRestriction, OpenInput } from '@embedpdf/react/runtime';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { annotationPlugin, useAnnotation } from '@embedpdf/react/annotation';
import { fontsPlugin, useFontsState } from '@embedpdf/react/fonts';
import { cloudEngine } from '@cloudpdf/engine';

import './list.css';

const engine = cloudEngine();
const plugins = [interactionPlugin(), annotationPlugin(), fontsPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const GROUPS = [
  ['document', 'In this document'],
  ['engine', 'The engine’s fonts'],
  ['standard', 'Standard'],
] as const;

// Why a font can't be chosen for new text, by its first restriction.
const WHY: Record<FontRestriction, string> = {
  subset: 'holds only the characters its text uses',
  'not-embedded': 'the file only names it',
  'preview-and-print': 'licensed for viewing and printing only',
  'unsupported-format': 'new text is written in TrueType or OpenType',
  'no-unicode-map': 'doesn’t say which characters it draws',
  'not-served': 'stays on the server',
};

function FontChip({ font }: { font: Font }) {
  const why = font.canChoose ? null : WHY[font.restrictions[0] ?? 'unsupported-format'];
  return (
    <li className="chip" data-choosable={font.canChoose}>
      <span className="chip-name">{font.name}</span>
      {why && <span className="chip-why">{why}</span>}
    </li>
  );
}

// Every font the document can be written in, grouped by where it comes from.
function Fonts() {
  const { fonts, status } = useFontsState();
  const annotation = useAnnotation();
  const cover = usePageList()[0]?.ref;

  // The engine fills Hebrew in from a Hebrew font and puts it in the file: the list reads it.
  const writeHebrew = async () => {
    if (!cover) return;
    await annotation.create(cover, {
      subtype: 'free-text',
      box: { x: 72, y: 72, width: 220, height: 40 },
      contents: 'שלום עולם',
      fontFamily: 'helvetica',
    });
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <h3 className="panel-title">Fonts</h3>
        <button type="button" className="button" onClick={writeHebrew}>
          Write in Hebrew
        </button>
        <span className="status" data-status={status}>
          {status}
        </span>
      </header>
      {GROUPS.map(([source, title]) => {
        const group = fonts?.fonts.filter((font) => font.source === source) ?? [];
        return (
          <div className="group" key={source}>
            <h4 className="group-title">{title}</h4>
            {group.length === 0 ? (
              <p className="empty">None</p>
            ) : (
              <ul className="chips">
                {group.map((font) => (
                  <FontChip key={font.name} font={font} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Fonts />
      </DocumentGate>
    </Viewer>
  );
}
