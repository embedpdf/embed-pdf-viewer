import { useEffect, useRef, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageEvent } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './events.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

interface Entry {
  id: number;
  event: string;
  detail: string;
}

// The latest stage events, newest first. Scroll, zoom or resize to add more.
function EventLog() {
  const stage = useStage();
  const [entries, setEntries] = useState<Entry[]>([]);
  const count = useRef(0);
  const log = (event: string, detail: string) =>
    setEntries((current) => [{ id: count.current++, event, detail }, ...current].slice(0, 6));

  useStageEvent(
    (stage) => stage.onPageChanged,
    ({ pageIndex, previousPageIndex }) =>
      log('onPageChanged', `page ${previousPageIndex + 1} → ${pageIndex + 1}`),
  );
  useStageEvent(
    (stage) => stage.onZoomChanged,
    ({ level, mode }) => log('onZoomChanged', `${Math.round(level * 100)}%, ${mode}`),
  );
  useStageEvent(
    (stage) => stage.onMotionEnded,
    ({ camera }) => log('onMotionEnded', `at rest, ${Math.round(camera.zoom * 100)}%`),
  );
  useStageEvent(
    (stage) => stage.onViewportChanged,
    ({ size }) =>
      log('onViewportChanged', `${Math.round(size.width)} × ${Math.round(size.height)}`),
  );

  // Glide to the second page on load, so the log has something to show.
  useEffect(() => stage.goToPage(1), [stage]);

  return (
    <ol className="log" aria-live="polite">
      {entries.map((entry) => (
        <li key={entry.id} className="entry">
          <code className="name">{entry.event}</code>
          <span className="detail">{entry.detail}</span>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="layout">
          <EventLog />
          <Stage className="stage">{() => <RenderLayer />}</Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}
