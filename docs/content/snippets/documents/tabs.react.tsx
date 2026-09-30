import { useDocuments, useDocumentsState } from '@embedpdf/react/runtime';

export function Tabs() {
  const documents = useDocuments();
  const { documents: open, activeId } = useDocumentsState();

  return (
    <div role="tablist">
      {open.map((document) => (
        <div key={document.id}>
          <button
            role="tab"
            aria-selected={document.id === activeId}
            onClick={() => documents.setActive(document.id)}
          >
            {document.name}
          </button>
          <button aria-label={`Close ${document.name}`} onClick={() => documents.close(document.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
