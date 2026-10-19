/**
 * The document tab bar: rounded-top tabs on the surface-alt strip, the active
 * tab merging into the toolbar surface below, and close-× on the active tab.
 * Opening another file is the `document:open` command (config/open-files.ts),
 * behind the document menu's Open row and a PDF dropped on the pages. A tab
 * with unsaved changes asks before it closes; a failed one says why on its
 * warning sign.
 *
 * The kernel's document registry is the tab model: `useDocumentsState()` for
 * the tabs, `useDocuments()` for close/setActive; there is no separate
 * document manager.
 */
import { useT } from '@embedpdf/react/i18n';
import { useDocuments, useDocumentsState, type DocumentInfo } from '@embedpdf/react/runtime';
import { useState } from 'react';

import { errorReasonKeyOf } from './document-boot';
import { Icon } from './icons';
import { CloseUnsavedDialog } from './unsaved-changes';

export type TabBarVisibility = 'always' | 'multiple' | 'never';

export function TabBar({
  visibility,
}: {
  /** When the tabs show: the layout's `tabs` (`tabsOf`). */
  visibility: TabBarVisibility;
}) {
  const { setActive, close } = useDocuments();
  const { documents, activeId } = useDocumentsState();
  const t = useT();
  // The tab that asks before it closes: its document's id, and the name it shows.
  const [closing, setClosing] = useState<{ id: string; name: string } | null>(null);

  const shouldShow = visibility === 'always' || (visibility === 'multiple' && documents.length > 1);
  if (!shouldShow) return null;

  const closeTab = (document: DocumentInfo, name: string) => {
    if (document.hasUnsavedChanges) setClosing({ id: document.id, name });
    else void close(document.id);
  };

  return (
    <div className="bg-surface-alt flex items-end pr-2 pt-2">
      <div className="flex flex-1 items-end overflow-x-auto pl-4">
        {documents.map((document) => {
          const isActive = activeId === document.id;
          const name =
            document.name ?? t('tabs.untitled', { params: { id: document.id.slice(0, 8) } });
          return (
            <div
              key={document.id}
              onClick={() => setActive(document.id)}
              role="tab"
              part={isActive ? 'tab tab-active' : 'tab'}
              tabIndex={0}
              aria-selected={isActive}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActive(document.id);
                }
              }}
              className={`group relative flex min-w-[120px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-surface text-fg z-10'
                  : 'bg-surface-alt text-fg-secondary hover:bg-hover hover:text-fg'
              }`}
            >
              {/* lifecycle glyphs — the tab exists from the moment open()
                  was called; these show what its document is doing */}
              {document.status === 'loading' && (
                <span
                  className="border-border-subtle border-t-accent h-3 w-3 flex-shrink-0 animate-spin rounded-full border"
                  aria-label={t('tabs.loading')}
                />
              )}
              {document.status === 'locked' && (
                <Icon name="lock" size={13} className="text-fg-muted flex-shrink-0" />
              )}
              {document.status === 'error' && (
                <span
                  className="flex flex-shrink-0"
                  role="img"
                  aria-label={t(errorReasonKeyOf(document.error))}
                  title={t(errorReasonKeyOf(document.error))}
                >
                  <Icon name="alertTriangle" size={13} className="text-red-500" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{name}</span>

              {/* close — on the active tab, and never the last document
                  (an empty workspace is designable, but not this demo's goal) */}
              {isActive && documents.length > 1 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(document, name);
                  }}
                  aria-label={t('tabs.close', { params: { name } })}
                  className="hover:bg-hover flex-shrink-0 cursor-pointer rounded-full p-1 opacity-100 transition-all"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {closing && (
        <CloseUnsavedDialog
          name={closing.name}
          onCancel={() => setClosing(null)}
          onClose={() => {
            setClosing(null);
            void close(closing.id);
          }}
        />
      )}
    </div>
  );
}
