/**
 * Selection demo — deliberately WITHOUT the Stage.
 *
 * It mounts standalone <PageView>s (no camera, no layout plugin) and drops the
 * interaction + selection layers on each. This proves the seam: text selection
 * depends on the page coordinate context + the engine's text geometry, NOT on the
 * Stage. Toggle Pointer/Pan to see the `text-select` tag gate selection on/off.
 *
 *   open with ?demo=selection
 */
import * as React from 'react';
import { useEffect, useState } from 'react';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { selectionPlugin } from '@embedpdf/plugin-selection';
import { renderPlugin } from '@embedpdf/plugin-render';
import {
  PageView,
  PagePointerSource,
  RenderLayer,
  SelectionLayer,
  Viewer,
  useSelection,
  useTool,
} from '@embedpdf/react';
import { bootstrap } from './engine';
import type { Boot } from './engine';

// No stagePlugin — that's the whole point.
const plugins = [interactionPlugin({ defaultTool: 'pointer' }), renderPlugin(), selectionPlugin()];

const PAGES = [0, 1, 2];
const WIDTH = 760;

function Toolbar() {
  const { activeToolId, activate } = useTool();
  const selection = useSelection();
  const btn = (id: string, label: string) => (
    <button
      onClick={() => activate(id)}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: `1px solid ${activeToolId === id ? '#1e88e5' : '#d0d0d0'}`,
        background: activeToolId === id ? '#1e88e5' : '#fff',
        color: activeToolId === id ? '#fff' : '#333',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid #e5e5e5',
      }}
    >
      <strong style={{ marginRight: 4 }}>Selection demo</strong>
      <span style={{ color: '#888', fontSize: 12, marginRight: 8 }}>
        no Stage — standalone &lt;PageView&gt;
      </span>
      {btn('pointer', 'Pointer (select text)')}
      {btn('pan', 'Pan (no text select)')}
      <button onClick={() => selection.clear()} style={{ marginLeft: 8, padding: '6px 12px' }}>
        Clear
      </button>
    </div>
  );
}

function Shell() {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Toolbar />
      <div style={{ flex: 1, overflow: 'auto', background: '#f3f4f6', padding: 24 }}>
        {PAGES.map((i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <PageView page={i} width={WIDTH}>
              <RenderLayer />
              <SelectionLayer />
              <PagePointerSource />
            </PageView>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SelectionDemo() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    bootstrap().then(setBoot, (e) => setError(String(e)));
  }, []);

  if (error) return <div style={{ padding: 24, color: '#c00' }}>engine failed: {error}</div>;
  if (!boot) return <div style={{ padding: 24, color: '#888' }}>booting engine…</div>;

  return (
    <Viewer
      engine={boot.engine}
      plugins={plugins}
      initialDocuments={[boot.documents[0]]}
      fallback={<div style={{ padding: 20 }}>opening document…</div>}
    >
      <Shell />
    </Viewer>
  );
}
