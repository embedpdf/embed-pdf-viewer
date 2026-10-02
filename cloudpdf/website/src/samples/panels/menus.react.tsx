import { useEffect, useRef } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  interactionPlugin,
  useInteraction,
  useInteractionState,
} from '@embedpdf/react/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/react/selection';
import { shellPlugin, useShell, useShellState } from '@embedpdf/react/shell';
import { cloudEngine } from '@cloudpdf/engine';

import './menus.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  shellPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const TOOLS = [
  { id: 'pointer', label: 'Select text' },
  { id: 'pan', label: 'Scroll with the hand' },
];

// A menu with a submenu: opening the submenu leaves its menu open.
function ViewMenu() {
  const shell = useShell();
  const interaction = useInteraction();
  const { openMenus } = useShellState();
  const { activeToolId } = useInteractionState();
  const bar = useRef<HTMLDivElement>(null);
  const anyOpen = openMenus.length > 0;

  // A press outside the menus, or Escape, closes all of them.
  useEffect(() => {
    if (!anyOpen) return;
    const outside = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) shell.closeAllMenus();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') shell.closeAllMenus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [shell, anyOpen]);

  return (
    <div className="toolbar">
      <div className="menubar" ref={bar}>
        <button
          type="button"
          className="button"
          aria-haspopup="menu"
          aria-expanded={openMenus.includes('view')}
          onClick={() => shell.toggleMenu('view')}
        >
          View ▾
        </button>
        {openMenus.includes('view') && (
          <div className="menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              aria-haspopup="menu"
              aria-expanded={openMenus.includes('view-tool')}
              onClick={() => shell.toggleMenu('view-tool')}
            >
              Tool <span aria-hidden="true">▸</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => shell.closeAllMenus()}
            >
              Close menus
            </button>
            {openMenus.includes('view-tool') && (
              <div className="menu submenu" role="menu">
                {TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={tool.id === activeToolId}
                    className="menu-item"
                    onClick={() => {
                      interaction.activateTool(tool.id);
                      shell.closeAllMenus();
                    }}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <output className="readout">Open menus: {anyOpen ? openMenus.join(' › ') : 'none'}</output>
    </div>
  );
}

function Workspace() {
  const shell = useShell();

  // The menu and its submenu are open when the document is.
  useEffect(() => {
    shell.openMenu('view');
    shell.openMenu('view-tool');
  }, [shell]);

  return (
    <>
      <ViewMenu />
      <Stage className="stage">
        {() => (
          <>
            <RenderLayer />
            <SelectionLayer />
          </>
        )}
      </Stage>
    </>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Workspace />
      </DocumentGate>
    </Viewer>
  );
}
