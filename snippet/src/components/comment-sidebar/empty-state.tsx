import { h } from 'preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { Icon } from '../ui/icon';

interface EmptyStateProps {
  documentId: string;
}

export const EmptyState = ({ documentId }: EmptyStateProps) => {
  const { translate } = useTranslations(documentId);

  return (
    <div class="text-fg-muted flex flex-col items-center gap-2 p-4">
      <Icon icon="comment" className="h-18 w-18 text-fg-muted" />
      <div className="text-fg-muted max-w-[150px] text-center text-sm">
        {translate('comments.emptyState')}
      </div>
    </div>
  );
};
