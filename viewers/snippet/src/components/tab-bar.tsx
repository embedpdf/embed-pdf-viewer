import { h, Fragment } from 'preact';
import { useCallback } from 'preact/hooks';
import { DocumentState } from '@embedpdf/core';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/preact';
import { Icon } from './ui/icon';

export type TabBarVisibility = 'always' | 'multiple' | 'never';

interface TabBarProps {
  documentStates: DocumentState[];
  activeDocumentId: string | null;
  /** When to show the tab bar */
  visibility?: TabBarVisibility;
  /** Allow opening new files via the + button */
  allowOpenFile?: boolean;
}

export function TabBar({
  documentStates,
  activeDocumentId,
  visibility = 'multiple',
  allowOpenFile = true,
}: TabBarProps) {
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

  // Determine if we should show the tab bar
  const shouldShow =
    visibility === 'always' || (visibility === 'multiple' && documentStates.length > 1);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="bg-bg-surface-alt flex items-end pr-2 pt-2">
      {/* Document Tabs */}
      <div className="flex flex-1 items-end overflow-x-auto pl-4">
        {documentStates.map((document) => {
          const isActive = activeDocumentId === document.id;
          return (
            <div
              key={document.id}
              onClick={() => onSelect(document.id)}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(document.id);
                }
              }}
              className={`group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-bg-surface text-fg-primary z-10'
                  : 'bg-bg-surface-alt text-fg-secondary hover:bg-interactive-hover hover:text-fg-primary'
              }`}
            >
              {/* Document Name */}
              <span className="min-w-0 flex-1 truncate">
                {document.name ?? `Document ${document.id.slice(0, 8)}`}
              </span>

              {/* Close Button - only show if more than 1 document */}
              {isActive && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(document.id);
                  }}
                  aria-label={`Close ${document.name ?? 'document'}`}
                  className={`hover:bg-interactive-hover flex-shrink-0 cursor-pointer rounded-full p-1 transition-all ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Icon icon="x" size={14} />
                </button>
              )}
            </div>
          );
        })}

        {/* Add Tab Button */}
        {allowOpenFile && (
          <button
            onClick={onOpenFile}
            className="text-fg-secondary hover:bg-interactive-hover hover:text-fg-primary mb-1.5 ml-1 flex-shrink-0 cursor-pointer rounded p-1.5 transition-colors"
            aria-label="Open File"
            title="Open File"
          >
            <Icon icon="plus" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
