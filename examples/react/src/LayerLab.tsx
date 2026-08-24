/**
 * LayerLab — a focused demo of the LAYER DOCUMENT model:
 *
 *   immutable BASE pdf  +  mutable LAYER (a small overlay holding your edits)
 *
 * Open a base alone, or a base WITH a layer (fresh or a saved artifact); edit the
 * layer (rotate pages — a real engine mutation, unlike the toy marker plugin);
 * then SAVE the layer on its own (a tiny re-openable `.layer`), or SAVE the whole
 * document as a single PDF — incremental (original bytes preserved) or full rewrite.
 *
 * Runs entirely on the LOCAL engine — no server. (`?demo=layers`)
 */
import * as React from 'react';
import { useEffect, useState } from 'react';
import { stagePlugin } from '@embedpdf/plugin-stage';
import { renderPlugin } from '@embedpdf/plugin-render';
import { pageEditPlugin } from '@embedpdf/plugin-page-edit';
import {
  Viewer,
  Stage,
  DocumentScope,
  RenderLayer,
  usePageEditor,
  type PageContextValue,
} from '@embedpdf/react';
import { useDocuments } from '@embedpdf/react';
import type { Engine, OpenInput, PdfSaveMode } from '@embedpdf/core';
import { createEngine, engineMode } from './engine';

// The minimal lens set for the demo: one vertical reading stage + render + page-edit.
const plugins = [stagePlugin({ layout: 'vertical' }), renderPlugin(), pageEditPlugin()];

const SAMPLES = [
  { id: 'ebook', name: 'Ebook', url: '/ebook.pdf' },
  { id: 'report', name: 'Report', url: '/report.pdf' },
  { id: 'manual', name: 'Manual', url: '/manual.pdf' },
];

const fetchBytes = async (url: string): Promise<Uint8Array> =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

const saveToDisk = (bytes: Uint8Array, filename: string): void => {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });

export function LayerLab() {
  // Thunk form: the Viewer constructs the engine on mount (cheap — it boots
  // lazily) and destroys it on unmount.
  return (
    <Viewer engine={createEngine} plugins={plugins} initialDocuments={[]}>
      <LayerShell />
    </Viewer>
  );
}

// What the currently-open document is — drives the status line + which save buttons show.
type OpenKind = { name: string; layered: boolean } | null;

function LayerShell() {
  const { docs, activeId, open, close, setActive, download, downloadLayer } = useDocuments();
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [openKind, setOpenKind] = useState<OpenKind>(null);
  const [status, setStatus] = useState('Open a base to begin.');
  const busy = (msg: string) => setStatus(msg);

  // Single-document demo: close whatever's open, then open the new source.
  const replace = async (source: OpenInput, name: string, layered: boolean) => {
    try {
      for (const d of docs) await close(d.id);
      const id = await open(source, { name });
      setActive(id);
      setOpenKind({ name, layered });
      setStatus(layered ? `Editing layer over “${name}”.` : `Viewing “${name}” (no layer).`);
    } catch (e) {
      setStatus(`Open failed: ${(e as Error).message}`);
    }
  };

  const sample = () => SAMPLES.find((s) => s.id === sampleId)!;

  const openBaseOnly = async () => {
    busy('opening base…');
    const s = sample();
    const bytes = await fetchBytes(s.url);
    await replace({ kind: 'bytes', id: `${s.id}-base-${Date.now()}`, bytes }, s.name, false);
  };

  const openWithFreshLayer = async () => {
    busy('opening base + new layer…');
    const s = sample();
    const baseBytes = await fetchBytes(s.url);
    await replace(
      {
        kind: 'layerBytes',
        id: `${s.id}-layer-${Date.now()}`,
        baseBytes,
        layer: { kind: 'fresh' },
      } as OpenInput,
      s.name,
      true,
    );
  };

  const openWithLayerFile = async () => {
    const file = await pickFile('.layer,application/octet-stream');
    if (!file) return;
    busy('opening base + saved layer…');
    const s = sample();
    const baseBytes = await fetchBytes(s.url);
    const layerBytes = new Uint8Array(await file.arrayBuffer());
    await replace(
      {
        kind: 'layerBytes',
        id: `${s.id}-relayer-${Date.now()}`,
        baseBytes,
        layer: { kind: 'artifact', bytes: layerBytes },
      } as OpenInput,
      s.name,
      true,
    );
  };

  const saveLayer = async () => {
    busy('saving layer…');
    try {
      const bytes = await downloadLayer();
      saveToDisk(bytes, `${sample().id}.layer`);
      setStatus(
        `Saved layer (${bytes.byteLength.toLocaleString()} bytes) — reopen it with “Open + saved layer”.`,
      );
    } catch (e) {
      setStatus(`Save layer failed: ${(e as Error).message}`);
    }
  };

  const savePdf = async (mode: PdfSaveMode) => {
    busy(`saving ${mode} PDF…`);
    try {
      const bytes = await download(undefined, { mode });
      saveToDisk(bytes, `${sample().id}-${mode}.pdf`);
      setStatus(`Saved ${mode} PDF (${bytes.byteLength.toLocaleString()} bytes).`);
    } catch (e) {
      setStatus(`Save PDF failed: ${(e as Error).message}`);
    }
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui' }}
    >
      {/* ── toolbar ── */}
      <div style={bar}>
        <strong style={{ marginRight: 8 }}>Layer Lab</strong>
        <label style={{ fontSize: 12, color: '#555' }}>
          base{' '}
          <select
            value={sampleId}
            onChange={(e) => setSampleId(e.target.value)}
            style={{ marginLeft: 2 }}
          >
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span style={sep} />
        <button style={btn} onClick={openBaseOnly}>
          Open base (no layer)
        </button>
        <button style={btnPrimary} onClick={openWithFreshLayer}>
          Open + new layer
        </button>
        <button style={btn} onClick={openWithLayerFile}>
          Open + saved layer…
        </button>
        <span style={{ flex: 1 }} />
        {openKind?.layered && (
          <button
            style={btn}
            onClick={saveLayer}
            title="Export just the layer (re-openable .layer)"
          >
            ⬇ Save layer
          </button>
        )}
        {openKind && (
          <>
            <button
              style={btn}
              onClick={() => savePdf('incremental')}
              title="Original bytes preserved + changes appended"
            >
              ⬇ PDF · incremental
            </button>
            <button style={btn} onClick={() => savePdf('rewrite')} title="Flattened full rewrite">
              ⬇ PDF · full
            </button>
          </>
        )}
      </div>

      {/* ── status ── */}
      <div style={statusBar}>
        {status}
        {openKind?.layered && (
          <span style={{ color: '#888', marginLeft: 8 }}>
            · rotate a page (↻) to edit the layer
          </span>
        )}
      </div>

      {/* ── viewer ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeId ? (
          <DocumentScope id={activeId}>
            <Stage
              style={{ height: '100%', background: '#0d1117' }}
              pageChrome={openKind?.layered ? (page) => <RotateButton page={page} /> : undefined}
            >
              {() => <RenderLayer />}
            </Stage>
          </DocumentScope>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#999' }}>
            no document open
          </div>
        )}
      </div>
    </div>
  );
}

/** A real layer edit: rotating a page writes through the engine into the layer. */
function RotateButton({ page }: { page: PageContextValue }) {
  const editor = usePageEditor();
  if (!editor.canEdit()) return null;
  return (
    <button
      onClick={() => editor.rotateBy(page.pon, 90)}
      title="Rotate this page 90° (writes to the layer)"
      style={{
        position: 'absolute',
        top: page.frame.top + 6,
        right: page.frame.right + 6,
        width: 26,
        height: 26,
        borderRadius: 6,
        border: 'none',
        background: 'rgba(56,88,233,0.92)',
        color: '#fff',
        fontSize: 15,
        cursor: 'pointer',
      }}
    >
      ↻
    </button>
  );
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid #e2e2e2',
  background: '#fafafa',
  flexWrap: 'wrap',
};
const statusBar: React.CSSProperties = {
  padding: '5px 12px',
  fontSize: 12,
  color: '#444',
  background: '#f4f4f4',
  borderBottom: '1px solid #e8e8e8',
};
const btn: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  border: '1px solid #ccc',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
};
const btnPrimary: React.CSSProperties = {
  ...btn,
  background: '#3858e9',
  color: '#fff',
  border: 'none',
};
const sep: React.CSSProperties = { width: 1, height: 20, background: '#ddd', margin: '0 2px' };
