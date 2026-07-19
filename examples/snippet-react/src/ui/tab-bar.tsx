/**
 * The document tab bar — a 1:1 port of v2's tab-bar.tsx
 * (viewers/snippet/src/components/tab-bar.tsx): rounded-top tabs on the
 * surface-alt strip, the active tab merging into the toolbar surface below,
 * close-× on the active tab, and a + button opening a real file dialog.
 *
 * v2 needed a DocumentManager capability; here the kernel's document registry
 * (useDocuments) already is the tab model — open/close/setActive, reactive.
 */
import { useRef } from 'react';
import { useDocuments } from '@embedpdf/react/runtime';
import type { OpenInput } from '@embedpdf/react/runtime';
import { Icon } from './icons';

export type TabBarVisibility = 'always' | 'multiple' | 'never';

export function TabBar({
  visibility = 'always',
  allowOpenFile = true,
}: {
  visibility?: TabBarVisibility;
  allowOpenFile?: boolean;
}) {
  const { docs, activeId, setActive, close, open } = useDocuments();
  const fileInput = useRef<HTMLInputElement>(null);

  const shouldShow = visibility === 'always' || (visibility === 'multiple' && docs.length > 1);
  if (!shouldShow) return null;

  const openFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const source: OpenInput = { kind: 'bytes', id: `${file.name}-${Date.now()}`, bytes };
    await open(source, { name: file.name });
  };

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
              tabIndex={0}
              aria-selected={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
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
                  onClick={(e) => {
                    e.stopPropagation();
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

        {allowOpenFile && (
          <>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label="Open File"
              title="Open File"
              className="text-fg-secondary hover:bg-hover hover:text-fg mb-1.5 ml-1 flex-shrink-0 cursor-pointer rounded p-1.5 transition-colors"
            >
              <Icon name="plus" size={14} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openFile(file);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
