import { h } from 'preact';
import { useRedaction } from '@embedpdf/plugin-redaction/preact';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { RedactionItem } from '@embedpdf/plugin-redaction';
import { RedactIcon } from './icons/redact';
import { RedactAreaIcon } from './icons/redact-area';
import { Icon } from './ui/icon';
import { Button } from './ui/button';
import { useDocumentPermissions } from '@embedpdf/core/preact';

export interface RedactionSidebarProps {
  documentId: string;
}

interface RedactionItemCardProps {
  item: RedactionItem;
  pageNumber: number;
  isSelected: boolean;
  onSelect: () => void;
}

const RedactionItemCard = ({ item, pageNumber, isSelected, onSelect }: RedactionItemCardProps) => {
  const IconComponent = item.kind === 'text' ? RedactIcon : RedactAreaIcon;

  return (
    <div
      onClick={onSelect}
      class={`border-border-subtle hover:bg-interactive-hover flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        isSelected ? 'bg-interactive-selected ring-accent ring-1' : ''
      }`}
    >
      {/* Icon with markColor and redactionColor */}
      <div class="flex-shrink-0">
        <IconComponent
          size={20}
          primaryColor={item.markColor}
          secondaryColor={item.redactionColor}
        />
      </div>

      {/* Content */}
      <div class="min-w-0 flex-1">
        {/* Page number */}
        <div class="text-fg-muted text-xs">Page {pageNumber}</div>

        {/* Type label */}
        <div class="text-fg-primary text-sm font-medium">
          {item.kind === 'text' ? 'Text Redaction' : 'Area Redaction'}
        </div>

        {/* Text content for text redactions */}
        {item.kind === 'text' && item.text && (
          <div class="text-fg-muted mt-1 truncate text-xs italic">"{item.text}"</div>
        )}
      </div>
    </div>
  );
};

const EmptyState = ({ documentId }: { documentId: string }) => {
  const { translate } = useTranslations(documentId);

  return (
    <div class="text-fg-muted flex flex-col items-center gap-2 p-4">
      <Icon icon="redact" className="h-18 w-18 text-fg-muted" />
      <div className="text-fg-muted max-w-[150px] text-center text-sm">
        {translate('redaction.emptyState', { fallback: 'No pending redactions' })}
      </div>
    </div>
  );
};

export function RedactionSidebar({ documentId }: RedactionSidebarProps) {
  const { state, provides } = useRedaction(documentId);
  const { canModifyAnnotations, canModifyContents } = useDocumentPermissions(documentId);
  const { provides: scrollApi } = useScrollCapability();
  const { translate } = useTranslations(documentId);

  // Flatten pending items from Record<number, RedactionItem[]>
  const allItems = Object.entries(state.pending)
    .flatMap(([page, items]) => items.map((item) => ({ item, pageNumber: Number(page) + 1 })))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const handleSelect = (item: RedactionItem) => {
    // Select the redaction item
    provides?.selectPending(item.page, item.id);

    // Scroll to the redaction position on the page (like comment-sidebar)
    scrollApi?.scrollToPage({
      pageNumber: item.page + 1,
      pageCoordinates: {
        x: item.rect.origin.x,
        y: item.rect.origin.y,
      },
      alignX: 50,
      alignY: 25,
      behavior: 'smooth',
    });
  };

  const handleClearAll = () => {
    provides?.clearPending();
  };

  const handleRedactAll = () => {
    provides?.commitAllPending();
  };

  return (
    <div class="flex h-full flex-col">
      {/* Header */}
      <div class="border-border-subtle border-b p-3">
        <h2 class="text-fg-primary text-md font-semibold">
          {translate('redaction.panel.title', { fallback: 'Redactions' })}
        </h2>
        {allItems.length > 0 && (
          <p class="text-fg-muted text-sm">
            {allItems.length === 1
              ? translate('redaction.panel.itemCount', {
                  fallback: '1 pending redaction',
                  params: { count: 1 },
                })
              : translate('redaction.panel.itemCountPlural', {
                  fallback: `${allItems.length} pending redactions`,
                  params: { count: allItems.length },
                })}
          </p>
        )}
      </div>

      {/* Scrollable list */}
      <div class="flex-1 overflow-y-auto p-3">
        {allItems.length === 0 ? (
          <EmptyState documentId={documentId} />
        ) : (
          <div class="space-y-2">
            {allItems.map(({ item, pageNumber }) => (
              <RedactionItemCard
                key={item.id}
                item={item}
                pageNumber={pageNumber}
                onSelect={() => handleSelect(item)}
                isSelected={state.selected?.id === item.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom action buttons */}
      {allItems.length > 0 && (
        <div class="border-border-subtle flex gap-2 border-t p-3">
          <Button
            onClick={handleClearAll}
            disabled={!canModifyAnnotations}
            className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover flex-1 rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate('redaction.panel.clearAll', { fallback: 'Clear All' })}
          </Button>
          <Button
            onClick={handleRedactAll}
            disabled={!canModifyContents}
            className="bg-accent text-fg-on-accent hover:!bg-accent-hover flex-1 rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate('redaction.panel.redactAll', { fallback: 'Redact All' })}
          </Button>
        </div>
      )}
    </div>
  );
}
