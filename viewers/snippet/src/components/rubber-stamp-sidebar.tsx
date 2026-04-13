import { h } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import {
  useStampLibraries,
  useStampsByLibrary,
  useStampCapability,
  useActiveStamp,
  StampImg,
  StampDefinition,
} from '@embedpdf/plugin-stamp/preact';
import { Icon } from './ui/icon';
import { ignore } from '@embedpdf/models';

export interface RubberStampSidebarProps {
  documentId: string;
  selectedLibraryId?: string;
}

const STAMP_THUMB_WIDTH = 120;

export function RubberStampSidebar({
  documentId,
  selectedLibraryId: selectedLibraryIdProp,
}: RubberStampSidebarProps) {
  const { translate } = useTranslations(documentId);
  const { provides: stampCapability } = useStampCapability();
  const { libraries } = useStampLibraries();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>('all');
  const stamps = useStampsByLibrary(selectedLibraryId, 'sidebar');
  const activeStamp = useActiveStamp(documentId);

  useEffect(() => {
    if (selectedLibraryIdProp) {
      setSelectedLibraryId(selectedLibraryIdProp);
    }
  }, [selectedLibraryIdProp]);

  const handleStampClick = useCallback(
    (libraryId: string, stamp: StampDefinition) => {
      if (!stampCapability) return;
      stampCapability.forDocument(documentId).activateStampPlacement(libraryId, stamp);
    },
    [stampCapability, documentId],
  );

  const handleRemoveStamp = useCallback(
    (e: Event, libraryId: string, stampId: string) => {
      e.stopPropagation();
      if (!stampCapability) return;
      stampCapability.removeStampFromLibrary(libraryId, stampId).wait(() => {}, ignore);
    },
    [stampCapability],
  );

  const handleExport = useCallback(() => {
    if (!stampCapability) return;
    const libraryIds = [...new Set(stamps.map((s) => s.library.id))];
    for (const id of libraryIds) {
      stampCapability.exportLibrary(id).wait((exported) => {
        const blob = new Blob([exported.pdf], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exported.name}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }, ignore);
    }
  }, [stampCapability, stamps]);

  const resolveLibraryName = (lib: { name: string; nameKey?: string }) =>
    translate(lib.nameKey ?? '', { fallback: lib.name });

  return (
    <div class="flex h-full flex-col">
      <div class="border-border-subtle border-b p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-fg-primary text-md font-medium">
            {translate('stamp.title', { fallback: 'Rubber Stamps' })}
          </h2>
          {/*stamps.length > 0 && (
            <button
              class="text-fg-muted hover:text-fg-primary rounded p-1 transition-colors"
              onClick={handleExport}
              title={translate('insert.rubberStamp.export', { fallback: 'Export Stamps' })}
            >
              <Icon icon="download" className="h-4 w-4" />
            </button>
          )*/}
        </div>

        {libraries.length > 1 && (
          <select
            class="border-border-default bg-bg-input focus:border-accent focus:ring-accent text-fg-primary mt-4 w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
            value={selectedLibraryId}
            onChange={(e) => setSelectedLibraryId((e.target as HTMLSelectElement).value)}
          >
            <option value="all">{translate('stamp.allStamps', { fallback: 'All Stamps' })}</option>
            {libraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {resolveLibraryName(lib)}
              </option>
            ))}
          </select>
        )}
      </div>

      {stamps.length > 0 ? (
        <div class="flex-1 overflow-y-auto p-4">
          <div class="grid grid-cols-2 gap-3">
            {stamps.map(({ library, stamp }) => {
              const isActive =
                activeStamp?.libraryId === library.id && activeStamp?.stamp.id === stamp.id;
              return (
                <div
                  key={`${library.id}-${stamp.id}`}
                  class={`group relative flex cursor-pointer items-center justify-center overflow-hidden rounded-md border transition-colors ${
                    isActive
                      ? 'border-accent bg-accent-light ring-accent ring-2'
                      : 'border-border-subtle bg-bg-surface hover:bg-interactive-hover hover:border-border-default'
                  }`}
                  style={{ aspectRatio: '1' }}
                  onClick={() => handleStampClick(library.id, stamp)}
                >
                  <StampImg
                    libraryId={library.id}
                    pageIndex={stamp.pageIndex}
                    width={STAMP_THUMB_WIDTH}
                    style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }}
                  />
                  {!library.readonly && (
                    <button
                      class="bg-bg-surface border-border-default text-fg-muted hover:text-fg-primary absolute right-1 top-1 flex rounded-full border p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                      onClick={(e) => handleRemoveStamp(e, library.id, stamp.id)}
                    >
                      <Icon icon="x" className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div class="text-fg-muted mt-8 flex flex-col items-center gap-2 p-4">
          <Icon icon="rubberStamp" className="h-18 w-18 text-fg-muted" />
          <div class="text-fg-muted max-w-[150px] text-center text-sm">
            {translate('stamp.emptyState', {
              fallback: 'No stamps found in the selected library.',
            })}
          </div>
        </div>
      )}
    </div>
  );
}
