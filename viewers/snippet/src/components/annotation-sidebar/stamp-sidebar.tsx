import { h } from 'preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { PdfStampAnnoObject } from '@embedpdf/models';
import { SidebarPropsBase } from './common';

export const StampSidebar = ({ documentId }: SidebarPropsBase<PdfStampAnnoObject>) => {
  const { translate } = useTranslations(documentId);
  return <div className="text-fg-muted text-sm">{translate('annotation.noStylesStamp')}</div>;
};
