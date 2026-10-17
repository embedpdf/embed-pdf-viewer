/**
 * Your own components in <PDFViewer>: `ToolbarItem`, `Panel` and `Region` put them in the
 * viewer, `useToolbarItem()` says where an item sits (and follows the bar to a rail when the
 * viewer narrows), and `Button`, `Menu` and `MenuItem` are the viewer's own.
 * `components.test.ts` drives it.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Menu,
  MenuItem,
  PDFViewer,
  Panel,
  Region,
  ToolbarItem,
  useToolbarItem,
} from '@embedpdf/viewer-react';
import type { LayoutFunction, Viewer } from '@embedpdf/viewer-react';

import { checkRecord } from './check';

export interface ComponentsRecord {
  viewer: Viewer | null;
  /** What each `MenuItem` picked said, in order. */
  readonly picked: string[];
  setWidth(width: string): void;
}

const record = checkRecord<ComponentsRecord>({ viewer: null, picked: [], setWidth: () => {} });

/** Where its toolbar item sits, as the hook says it. */
function Where() {
  const { orientation, edge, size, variant } = useToolbarItem();
  return (
    <span
      data-check="where"
      data-edge={edge}
      data-size={size}
      data-variant={variant ?? 'none'}
      style={{
        display: 'inline-flex',
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
      }}
    >
      {orientation}
    </span>
  );
}

/** Two sizes, as `useToolbarItem()` picks: the toolbar must measure the one it draws. */
function Sized() {
  const { variant } = useToolbarItem();
  return (
    <span
      data-check="sized"
      data-drawn={variant ?? 'none'}
      style={{ display: 'inline-block', overflow: 'hidden', width: variant === 'short' ? 48 : 700 }}
    >
      Sized
    </span>
  );
}

const layout: LayoutFunction = (base, env) => {
  const placed = base
    .add({ custom: 'where' }, { to: 'main', section: 'start' })
    .add(
      { custom: 'sized', variants: ['full', 'short'], command: 'zoom:in' },
      { to: 'main', section: 'start' },
    )
    .add({ custom: 'zoom-in' }, { to: 'main', section: 'start' })
    .add({ custom: 'share' }, { to: 'main', section: 'start' })
    .addPanel('notes', { side: 'end', title: 'Notes', icon: 'book' })
    .add('panel:notes', { to: 'main', section: 'end' });
  return env.width < 900 ? placed.place('main', 'start') : placed;
};

function App() {
  const [width, setWidth] = useState('100%');
  record.setWidth = setWidth;
  return (
    <PDFViewer
      src="/sample.pdf"
      layout={layout}
      style={{ height: '100vh', width, display: 'block' }}
      onReady={(viewer) => {
        record.viewer = viewer;
      }}
    >
      <Region name="header">
        <header data-check="header">Acme Contracts</header>
      </Region>
      <ToolbarItem id="where">
        <Where />
      </ToolbarItem>
      <ToolbarItem id="sized">
        <Sized />
      </ToolbarItem>
      <ToolbarItem id="zoom-in">
        <Button command="zoom:in" />
      </ToolbarItem>
      <ToolbarItem id="share">
        <Menu icon="link" label="Share">
          <MenuItem icon="copy" onSelect={() => record.picked.push('copy')}>
            Copy link
          </MenuItem>
          <MenuItem icon="message" onSelect={() => record.picked.push('email')}>
            Email a link
          </MenuItem>
        </Menu>
      </ToolbarItem>
      <Panel id="notes">
        <textarea data-check="notes" placeholder="Your notes" />
      </Panel>
      <Region name="footer">
        <footer data-check="footer">Saved a minute ago</footer>
      </Region>
    </PDFViewer>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
