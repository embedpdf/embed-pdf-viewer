import { DocumentState } from '@embedpdf/core';
import { CloseIcon, DocumentIcon, PlusIcon } from './icons';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import { useCallback } from 'react';

type TabBarProps = {
  documentStates: DocumentState[];
  activeDocumentId: string | null;
};

export function TabBar({ documentStates, activeDocumentId }: TabBarProps) {
  const { provides } = useDocumentManagerCapability();

  const onSelect = useCallback(
    (id: string) => {
      provides?.setActiveDocument(id);
    },
    [provides],
  );

  const onClose = useCallback(
    (id: string) => {
      provides?.closeDocument(id);
    },
    [provides],
  );

  const onOpenFile = useCallback(() => {
    provides?.openFileDialog();
  }, [provides]);

  return (
    <div className="flex items-end gap-0.5 bg-gray-100 px-2 pt-2">
      {/* Document Tabs */}
      <div className="flex flex-1 items-end gap-0.5 overflow-x-auto">
        {documentStates.map((document) => (
          <div
            key={document.id}
            onClick={() => onSelect(document.id)}
            role="tab"
            tabIndex={0}
            aria-selected={activeDocumentId === document.id}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(document.id);
              }
            }}
            className={`group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium transition-all ${
              activeDocumentId === document.id
                ? 'bg-white text-gray-900 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]'
                : 'bg-gray-200/60 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
            } `}
          >
            {/* Document Icon */}
            <DocumentIcon className="h-4 w-4 flex-shrink-0" title="Document" />

            {/* Document Name */}
            <span className="min-w-0 flex-1 truncate">
              {document.name ?? `Document ${document.id.slice(0, 8)}`}
            </span>

            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(document.id);
              }}
              aria-label={`Close ${document.name ?? 'document'}`}
              className={`flex-shrink-0 cursor-pointer rounded-full p-1 transition-all hover:bg-gray-300/50 ${
                // Show close always unless the tab is compact and not active
                activeDocumentId === document.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <CloseIcon className="h-3.5 w-3.5" title="Close" />
            </button>
          </div>
        ))}

        {/* Add Tab (Open File) - placed directly after tabs like Chrome */}
        <button
          onClick={onOpenFile}
          className="mb-2 ml-1 flex-shrink-0 cursor-pointer rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-200/80 hover:text-gray-800"
          aria-label="Open File"
          title="Open File"
        >
          <PlusIcon className="h-3.5 w-3.5" title="Open File" />
        </button>
      </div>
    </div>
  );
}
