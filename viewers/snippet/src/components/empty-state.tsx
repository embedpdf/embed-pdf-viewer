import { h } from 'preact';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { Icon } from './ui/icon';

export function EmptyState() {
  const { provides } = useDocumentManagerCapability();
  const { translate } = useTranslations();

  const handleOpenFile = () => {
    provides?.openFileDialog();
  };

  return (
    <div className="bg-bg-app flex h-full w-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center text-center">
        {/* Icon */}
        <div className="bg-accent-light mb-6 rounded-full p-5">
          <Icon icon="file" size={48} className="text-accent" />
        </div>

        {/* Title */}
        <h2 className="text-fg-primary mb-2 text-xl font-semibold">
          {translate('emptyState.title')}
        </h2>

        {/* Description */}
        <p className="text-fg-secondary mb-6 text-sm leading-relaxed">
          {translate('emptyState.description')}
          <br />
          {translate('emptyState.descriptionMulti')}
        </p>

        {/* Open Button */}
        <button
          onClick={handleOpenFile}
          className="bg-accent hover:bg-accent-hover text-accent-fg inline-flex cursor-pointer items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium shadow-sm transition-all"
        >
          <Icon icon="plus" size={16} />
          {translate('emptyState.openButton')}
        </button>

        {/* Hint */}
        <p className="text-fg-muted mt-4 text-xs">{translate('emptyState.supportedFormats')}</p>
      </div>
    </div>
  );
}
