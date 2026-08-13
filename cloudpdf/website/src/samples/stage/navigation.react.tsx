import { useState } from 'react';
import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin, usePages } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import {
  Demo,
  Toolbar,
  Button,
  Badge,
  TextInput,
  Spacer,
  StageFrame,
  stageFill,
} from './_shared/chrome';

const engine = cloudEngine({ baseUrl: 'https://demo.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_demo_ebook' };

function PageToolbar() {
  const { currentPage, pageCount, goToPage, next, prev } = usePages();
  const [typed, setTyped] = useState('');
  const jump = () => {
    const n = Number(typed);
    if (n >= 1 && n <= pageCount) goToPage(n - 1); // goToPage counts from 0
    setTyped('');
  };
  return (
    <Toolbar>
      <Button onClick={() => prev()}>‹ Previous</Button>
      <Badge>
        Page{' '}
        <strong>
          {currentPage + 1} / {pageCount}
        </strong>
      </Badge>
      <Button onClick={() => next()}>Next ›</Button>
      <Spacer />
      <TextInput value={typed} onChange={setTyped} onEnter={jump} placeholder="Go to page…" />
    </Toolbar>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <Demo>
        <DocumentGate fallback={<p>Loading…</p>}>
          <PageToolbar />
          <StageFrame height={420}>
            <Stage style={stageFill}>{() => <RenderLayer />}</Stage>
          </StageFrame>
        </DocumentGate>
      </Demo>
    </Viewer>
  );
}
