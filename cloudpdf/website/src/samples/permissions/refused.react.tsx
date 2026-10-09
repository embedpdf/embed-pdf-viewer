import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Viewer, DocumentGate, isPluginError, useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import { cloudEngine } from '@cloudpdf/engine';

import './refused.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Read and select, but no downloading.
const scope = ['doc.open', 'doc.render', 'doc.text.select'];

function DownloadAnyway() {
  const documents = useDocuments();
  const [result, setResult] = useState<ReactNode>(null);

  const download = useCallback(async () => {
    try {
      const bytes = await documents.download();
      setResult(`Downloaded ${bytes.byteLength} bytes.`);
    } catch (error) {
      if (isPluginError(error, 'permission-denied')) {
        setResult(
          <>
            Refused: <code>{error.code}</code>, missing <code>{error.permission}</code>
          </>,
        );
      }
    }
  }, [documents]);

  // On load, the call the button makes, so the refusal shows at once.
  useEffect(() => {
    void download();
  }, [download]);

  return (
    <div className="toolbar">
      <button type="button" className="button" onClick={download}>
        Download anyway
      </button>
      <output className="result">{result}</output>
    </div>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} scope={scope} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Opening…</p>}>
        <DownloadAnyway />
        <Stage className="stage">{() => <RenderLayer />}</Stage>
      </DocumentGate>
    </Viewer>
  );
}
