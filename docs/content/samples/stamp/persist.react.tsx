import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/react/annotation';
import {
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
  stampPlugin,
  useArmStampAsset,
  useStamp,
  useStampAssets,
  useStampLibraries,
} from '@embedpdf/react/stamp';
import { localEngine } from '@embedpdf/engine';

import {
  Button,
  Demo,
  Readout,
  Spacer,
  StageFrame,
  Toolbar,
  stageFill,
} from '../stage/_shared/chrome';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // stamp libraries are PDFs; they open here too
// [!/asset-engine]
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** Where the library PDFs live between sessions: one IndexedDB store. Any
 *  object with `list` / `put` / `delete` works — a backend of your own too. */
const store = indexedDbByteStore('stamp-docs-demo');

function Libraries() {
  const stamp = useStamp();
  const libraries = useStampLibraries();
  const assets = useStampAssets();
  const { armAsset } = useArmStampAsset();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restored, setRestored] = useState<number | null>(null);

  // Restore on mount; from then on every change writes the library back.
  useEffect(() => {
    void restoreStampLibraries(stamp, store).then((ids) => setRestored(ids.length));
    return persistStampLibraries(stamp, store);
  }, [stamp]);

  const importPdf = (file: File) =>
    // The file name is a fallback: a library names itself through its /Title.
    void stamp.importLibraryPdf(file, { name: file.name.replace(/\.pdf$/i, '') });

  const exportPdf = (libraryId: string, name: string) => {
    const bytes = stamp.exportLibrary(libraryId);
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    Object.assign(document.createElement('a'), { href: url, download: `${name}.pdf` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <Toolbar>
      <Readout>
        {restored === null
          ? 'restoring…'
          : `${restored} restored · reload the page to see them come back`}
      </Readout>
      <Spacer />
      {libraries.map((library) => (
        <Button
          key={library.id}
          title={`Download "${library.name}" as a PDF — open it in Acrobat, or import it here again`}
          onClick={() => exportPdf(library.id, library.name)}
        >
          ⬇ {library.name}
        </Button>
      ))}
      {assets.slice(0, 3).map((asset) => (
        <Button
          key={asset.id}
          title={`Place "${asset.label}"`}
          onClick={() => void armAsset(asset.id)}
        >
          {asset.label}
        </Button>
      ))}
      <Button
        title="Import any PDF as a library: one stamp per page"
        onClick={() => fileRef.current?.click()}
      >
        + Import PDF
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) importPdf(file);
        }}
      />
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <Libraries />
          <StageFrame height={420}>
            <Stage style={stageFill}>
              {() => (
                <>
                  <RenderLayer annotations={false} />
                  <AnnotationLayer />
                </>
              )}
            </Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
