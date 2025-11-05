import { DocumentState } from '@embedpdf/core';
import { useState, MouseEvent } from 'react';
import { TabContextMenu } from './tab-context-menu';
import { View } from '@embedpdf/plugin-view-manager/react';
import { useOpenDocuments } from '@embedpdf/plugin-document-manager/react';
import { CloseIcon, DocumentIcon, PlusIcon } from './icons';

interface TabBarProps {
  currentView: View | undefined;
  onSelect: (documentId: string) => void;
  onClose: (documentId: string) => void;
  onOpenFile: () => void;
}

export function TabBar({ currentView, onSelect, onClose, onOpenFile }: TabBarProps) {
  const documentStates = useOpenDocuments(currentView?.documentIds ?? []);
  const [contextMenu, setContextMenu] = useState<{
    documentState: DocumentState;
    position: { x: number; y: number };
  } | null>(null);

  const handleContextMenu = (e: MouseEvent, documentState: DocumentState) => {
    e.preventDefault();
    setContextMenu({
      documentState,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  return (
    <>
      <div className="flex items-end gap-0.5 bg-gray-100 px-2 pt-2">
        {/* Document Tabs */}
        <div className="flex flex-1 items-end gap-0.5 overflow-x-auto">
          {documentStates.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onSelect(doc.id)}
              onContextMenu={(e) => handleContextMenu(e, doc)}
              role="tab"
              tabIndex={0}
              aria-selected={doc.id === currentView?.activeDocumentId}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(doc.id);
                }
              }}
              className={`group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-md px-3 py-2.5 text-sm font-medium transition-all ${
                doc.id === currentView?.activeDocumentId
                  ? 'bg-white text-gray-900 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.06)]'
                  : 'bg-gray-200/60 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
              } `}
            >
              {/* Document Icon */}
              <DocumentIcon className="h-4 w-4 flex-shrink-0" title="Document" />

              {/* Document Name */}
              <span className="min-w-0 flex-1 truncate">{doc.name || 'Untitled'}</span>

              {/* Close Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(doc.id);
                }}
                aria-label={`Close ${doc.name || 'document'}`}
                className={`flex-shrink-0 cursor-pointer rounded-full p-1 transition-all hover:bg-gray-300/50 ${
                  // Show close always unless the tab is compact and not active
                  doc.id === currentView?.activeDocumentId
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

      {/* Context Menu */}
      {contextMenu && currentView && (
        <TabContextMenu
          documentState={contextMenu.documentState}
          currentViewId={currentView.id}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
