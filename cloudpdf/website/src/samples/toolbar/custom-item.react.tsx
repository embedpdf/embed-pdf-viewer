import { useEffect, useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, useStage, useStageState } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { commandsPlugin, standardCommands, useCommands } from '@embedpdf/react/commands';
import { Toolbar, custom, group, item } from '@embedpdf/react/toolbar';
import type { BarSchema } from '@embedpdf/react/toolbar';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import { cloudEngine } from '@cloudpdf/engine';

import './custom-item.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), commandsPlugin({ commands: standardCommands })];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// The page number is an item of your own: it gets smaller first, and in the "More" menu it's the
// 'page:go-to' command.
const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('zoom', ['zoom:out', 'zoom:in', item('zoom:fit-width', { importance: 2 })])],
    center: [
      group('pages', [
        'page:previous',
        custom('page-number', 'page:go-to', { variants: ['full', 'compact'] }),
        'page:next',
      ]),
    ],
    end: [group('document', [item('document:download', { variants: ['icon+label', 'icon'] })])],
  },
};

const ICONS: Record<string, string> = {
  'previous-page': '‹',
  'next-page': '›',
  'zoom-out': '−',
  'zoom-in': '+',
  'fit-width': '↔',
  download: '↓',
};

const renderCommand = (command: ResolvedCommand, variant: string, run: () => void) => (
  <button
    type="button"
    className="button"
    title={command.label}
    aria-label={command.label}
    disabled={!command.enabled}
    onClick={run}
  >
    <span aria-hidden>{ICONS[command.icon ?? ''] ?? '…'}</span>
    {variant === 'icon+label' && <span>{command.label}</span>}
  </button>
);

// The item itself: "Page 3 of 120", or "3 / 120" when there's less room.
function PageNumber({ compact }: { compact: boolean }) {
  const stage = useStage();
  const { currentPageIndex, pageCount } = useStageState();
  const [typed, setTyped] = useState<string | null>(null);

  return (
    <label className="page-number">
      {!compact && 'Page'}
      <input
        className="page-input"
        inputMode="numeric"
        aria-label="Page number"
        value={typed ?? String(currentPageIndex + 1)}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={() => setTyped(null)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          const number = Number(typed);
          if (Number.isInteger(number) && number >= 1) stage.goToPage(number - 1);
          setTyped(null);
        }}
      />
      {compact ? `/ ${pageCount}` : `of ${pageCount}`}
    </label>
  );
}

// 'page:go-to', a command of your own: it opens a small "Go to page" form.
function GoToPage() {
  const commands = useCommands();
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      commands.registerCommand({
        id: 'page:go-to',
        label: 'Go to page…',
        run: () => setOpen(true),
      }),
    [commands],
  );

  if (!open) return null;
  return (
    <div className="go-to" role="dialog" aria-label="Go to page">
      <PageNumber compact={false} />
      <button type="button" className="button" onClick={() => setOpen(false)}>
        Done
      </button>
    </div>
  );
}

export default function App() {
  const [width, setWidth] = useState(100);

  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <label className="width">
          Toolbar width
          <input
            type="range"
            min={30}
            max={100}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
          <output>{width}%</output>
        </label>
        <div className="frame" style={{ width: `${width}%` }}>
          <Toolbar
            bar={bar}
            renderCommand={renderCommand}
            renderCustom={{
              'page-number': (variant) => <PageNumber compact={variant === 'compact'} />,
            }}
          />
        </div>
        <GoToPage />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
