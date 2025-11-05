import { DocumentState } from '@embedpdf/core';
import { useState, MouseEvent } from 'react';
import { TabContextMenu } from './tab-context-menu';
import { View } from '@embedpdf/plugin-view-manager/react';
import { useOpenDocuments } from '@embedpdf/plugin-document-manager/react';

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
      <div className="flex items-center border-b border-gray-200 bg-gray-50">
        {documentStates.map((doc) => (
          <div
            key={doc.id}
            className={`group relative flex cursor-pointer items-center border-r border-gray-200 px-4 py-2 ${
              doc.id === currentView?.activeDocumentId ? 'bg-white' : 'hover:bg-gray-100'
            }`}
            onClick={() => onSelect(doc.id)}
            onContextMenu={(e) => handleContextMenu(e, doc)}
          >
            <span className="mr-2 text-sm">{doc.name || 'Untitled'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(doc.id);
              }}
              className="rounded p-1 opacity-0 hover:bg-gray-200 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
        <button onClick={onOpenFile} className="px-4 py-2 text-sm hover:bg-gray-100">
          + Open File
        </button>
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
