import { CSSProperties, useMemo, useState } from 'react';
import { Annotation, Model, ToolId, initialModel } from './core/model';
import { rectToTransform } from './core/geom';
import { Surface } from './react/Surface';
import { createStore, useModel } from './react/store';

const PAGE_W = 800;
const PAGE_H = 560;

function seed(): Model {
  const a1: Annotation = {
    id: 'a1',
    kind: 'square',
    color: '#1e88e5',
    transform: rectToTransform({ x: 150, y: 150 }, { x: 300, y: 270 }),
  };
  const a2: Annotation = {
    id: 'a2',
    kind: 'circle',
    color: '#e53935',
    transform: rectToTransform({ x: 380, y: 200 }, { x: 520, y: 340 }),
  };
  return { ...initialModel, byId: { a1, a2 }, order: ['a1', 'a2'], seq: 2 };
}

const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'square', label: 'Square' },
  { id: 'circle', label: 'Circle' },
];

export default function App() {
  const store = useMemo(() => createStore(seed()), []);
  const active = useModel(store, (m) => m.tool);
  const color = useModel(store, (m) => m.color);
  const count = useModel(store, (m) => m.order.length);
  const [zoom, setZoom] = useState(1);

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid #e5e5e5',
        }}
      >
        <strong style={{ marginRight: 4 }}>Annotation spike</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => store.dispatch({ t: 'setTool', tool: t.id })}
              style={tab(active === t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => store.dispatch({ t: 'setColor', color: e.target.value })}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          Zoom
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          {zoom.toFixed(1)}×
        </label>
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 13 }}>
          {count} shapes · drag to create · click to select · ⇧ to multi-select · drag empty space =
          marquee
        </span>
      </header>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#f3f4f6',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 24,
        }}
      >
        <Surface store={store} zoom={zoom} pageW={PAGE_W} pageH={PAGE_H} />
      </div>
    </div>
  );
}

function tab(on: boolean): CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${on ? '#1e88e5' : '#d0d0d0'}`,
    background: on ? '#1e88e5' : '#fff',
    color: on ? '#fff' : '#333',
    cursor: 'pointer',
  };
}
