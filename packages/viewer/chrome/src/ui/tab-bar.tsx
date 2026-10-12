/**
 * The document tab bar: rounded-top tabs on the surface-alt strip, the active
 * tab merging into the toolbar surface below, and close-× on the active tab.
 * Opening another file is the `document:open` command (config/open-files.ts),
 * behind the document menu's Open row and a PDF dropped on the pages.
 *
 * The kernel's document registry is the tab model: `useDocumentsState()` for
 * the tabs, `useDocuments()` for close/setActive; there is no separate
 * document manager.
 */
import { useDocuments, useDocumentsState } from '@embedpdf/react/runtime';

import { Icon } from './icons';

export type TabBarVisibility = 'always' | 'multiple' | 'never';

export function TabBar({
  visibility,
}: {
  /** When the tabs show: the layout's `tabs` (`tabsOf`). */
  visibility: TabBarVisibility;
}) {
  const { setActive, close } = useDocuments();
  const { documents: docs, activeId } = useDocumentsState();

  const shouldShow = visibility === 'always' || (visibility === 'multiple' && docs.length > 1);
  if (!shouldShow) return null;

  return (
    <div className="bg-surface-alt flex items-end pr-2 pt-2">
      <div className="flex flex-1 items-end overflow-x-auto pl-4">
        {docs.map((doc) => {
          const isActive = activeId === doc.id;
          return (
            <div
              key={doc.id}
              onClick={() => setActive(doc.id)}
              role="tab"
              part={isActive ? 'tab tab-active' : 'tab'}
              tabIndex={0}
              aria-selected={isActive}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActive(doc.id);
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
              {doc.status === 'loading' && (
                <span
                  className="border-border-subtle border-t-accent h-3 w-3 flex-shrink-0 animate-spin rounded-full border"
                  aria-label="Loading"
                />
              )}
              {doc.status === 'locked' && (
                <Icon name="lock" size={13} className="text-fg-muted flex-shrink-0" />
              )}
              {doc.status === 'error' && (
                <Icon name="alertTriangle" size={13} className="flex-shrink-0 text-red-500" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {doc.name ?? `Document ${doc.id.slice(0, 8)}`}
              </span>

              {/* close — on the active tab, and never the last document
                  (an empty workspace is designable, but not this demo's goal) */}
              {isActive && docs.length > 1 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void close(doc.id);
                  }}
                  aria-label={`Close ${doc.name ?? 'document'}`}
                  className="hover:bg-hover flex-shrink-0 cursor-pointer rounded-full p-1 opacity-100 transition-all"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
