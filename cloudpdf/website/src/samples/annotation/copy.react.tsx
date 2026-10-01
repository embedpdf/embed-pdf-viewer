import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate, usePageList } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { interactionPlugin } from '@embedpdf/react/interaction';
import {
  AnnotationLayer,
  annotationPlugin,
  useAnnotation,
  useAnnotationState,
} from '@embedpdf/react/annotation';
import { cloudEngine } from '@cloudpdf/engine';

import './copy.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// On load: a rectangle and a text box on the cover, the rectangle selected.
function AddAnnotations() {
  const annotation = useAnnotation();
  const ready = useAnnotationState((state) => state.status === 'ready');
  const cover = usePageList()[0]?.ref;
  const added = useRef(false);

  useEffect(() => {
    if (!ready || !cover || added.current) return;
    added.current = true;
    void annotation.create(cover, {
      subtype: 'free-text',
      box: { x: 300, y: 512, width: 230, height: 40 },
      contents: 'Copy me too',
      fontSize: 16,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
    });
    void annotation.create(
      cover,
      {
        subtype: 'square',
        box: { x: 96, y: 506, width: 178, height: 54 },
        color: '#e5484d',
        interiorColor: '#ffe4e1',
        strokeWidth: 3,
      },
      undefined,
      { select: true },
    );
  }, [annotation, ready, cover]);

  return null;
}

// A read passed to create() makes the same annotation again, here on the next page.
function CopyButton() {
  const annotation = useAnnotation();
  const stage = useStage();
  const pages = usePageList();
  const { selected } = useAnnotationState();
  const [status, setStatus] = useState('');
  const [first] = selected;
  const index = first
    ? pages.findIndex((page) => page.ref.objectNumber === first.page.objectNumber)
    : -1;
  const next = pages[index + 1];

  const copyToNextPage = async () => {
    if (!first || !next) return;
    const copy = annotation.get(first.ref)!;
    const { annotation: made } = await annotation.create(next.ref, copy, undefined, {
      select: true, // so the next click copies the copy, a page further
    });
    stage.reveal(next.ref, { rect: made.rect });
    setStatus(`Copied to page ${next.index + 1}`);
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="button"
        disabled={selected.length !== 1 || !next}
        onClick={() => void copyToNextPage()}
      >
        Copy to the next page
      </button>
      <span className="spacer" />
      <output className="readout">{status || 'Select an annotation to copy'}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <AddAnnotations />
        <CopyButton />
        <Stage className="stage">
          {() => (
            <>
              <RenderLayer annotations={false} />
              <AnnotationLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
