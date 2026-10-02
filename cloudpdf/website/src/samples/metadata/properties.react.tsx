import { Viewer, DocumentGate } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { metadataPlugin, useMetadataState } from '@embedpdf/react/metadata';
import { cloudEngine } from '@cloudpdf/engine';

import './properties.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [metadataPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const FIELDS = [
  ['title', 'Title'],
  ['author', 'Author'],
  ['subject', 'Subject'],
  ['keywords', 'Keywords'],
  ['creator', 'Made in'],
  ['producer', 'Turned into a PDF by'],
  ['createdAt', 'Created'],
  ['modifiedAt', 'Last changed'],
  ['trapped', 'Trapped'],
] as const;

// Dates are ISO strings: show them in the reader's own format.
const DATES: ReadonlySet<string> = new Set(['createdAt', 'modifiedAt']);
const show = (field: string, value: string | null) => {
  if (value === null) return null;
  return DATES.has(field) ? new Date(value).toLocaleString() : value;
};

// The document's properties, the way a "Document properties" dialog shows them.
function Properties() {
  const { metadata, status } = useMetadataState();

  return (
    <section className="panel">
      <header className="panel-header">
        <h3 className="panel-title">Document properties</h3>
        <span className="status" data-status={status}>
          {status}
        </span>
      </header>
      <dl className="properties">
        {FIELDS.map(([field, label]) => {
          const value = metadata ? show(field, metadata[field]) : null;
          return (
            <div className="property" key={field}>
              <dt>{label}</dt>
              <dd className={value === null ? 'unset' : undefined}>{value ?? 'not set'}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export default function App() {
  return (
    <Viewer engine={engine} plugins={plugins} initialDocuments={[{ source: ebook }]}>
      <DocumentGate fallback={<p className="loading">Loading…</p>}>
        <Properties />
      </DocumentGate>
    </Viewer>
  );
}
