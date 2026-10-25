import { Viewer, DocumentGate, saveFile } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Stage, stagePlugin } from '@embedpdf/react/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/react/render';
import {
  attachmentPlugin,
  displayNameOf,
  useAttachment,
  useAttachmentState,
} from '@embedpdf/react/attachment';
import type { AttachedFile } from '@embedpdf/react/attachment';
import { localEngine } from '@embedpdf/engine';

import './files.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), attachmentPlugin()];

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

/** A file's size, as people read it. */
const sizeOf = (bytes: number | null) =>
  bytes === null ? '' : bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

// The files the document carries: attach some, save one, remove one.
function Files() {
  const attachment = useAttachment();
  const { files, canAdd, canDownload } = useAttachmentState();

  const save = async (file: AttachedFile) => {
    const { bytes, name, mimeType } = await attachment.download(file);
    saveFile(bytes, name, mimeType ?? undefined);
  };

  return (
    <aside className="files">
      <header className="files-header">
        <h3 className="files-title">Files</h3>
        <label className="button primary" data-disabled={!canAdd || undefined}>
          Attach
          <input
            type="file"
            multiple
            hidden
            disabled={!canAdd}
            onChange={(event) => {
              const picked = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              if (picked.length > 0) void attachment.add(picked.map((data) => ({ data })));
            }}
          />
        </label>
      </header>
      {files.length === 0 ? (
        <p className="empty">Attach a file to carry it inside the document.</p>
      ) : (
        <ul className="list">
          {files.map((file) => (
            <li key={file.id} className="row" data-pending={attachment.isPending(file) || undefined}>
              <button
                type="button"
                className="row-name"
                disabled={!canDownload}
                onClick={() => save(file)}
              >
                <bdi>{displayNameOf(file)}</bdi>
                <span className="row-size">{sizeOf(file.size)}</span>
              </button>
              <button
                type="button"
                className="row-remove"
                aria-label={`Remove ${displayNameOf(file)}`}
                disabled={!attachment.canRemove(file)}
                onClick={() => attachment.remove(file)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: welcome }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <div className="layout">
          <Files />
          <Stage className="stage">{() => <RenderLayer />}</Stage>
        </div>
      </DocumentGate>
    </Viewer>
  );
}
