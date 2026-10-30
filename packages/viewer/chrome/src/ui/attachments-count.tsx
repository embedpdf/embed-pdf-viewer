/**
 * How many files the document carries, the `attachments-count` item of the attachments panel's
 * bar: its attachments and the files on its pages.
 */
import { useAttachmentState } from '@embedpdf/react/attachment';
import { useT } from '@embedpdf/react/i18n';

export function AttachmentsCount() {
  const t = useT();
  const { files } = useAttachmentState();
  return (
    <span className="text-fg-muted whitespace-nowrap text-xs">
      {t(files.length === 1 ? 'attachments.count' : 'attachments.countPlural', {
        params: { count: String(files.length) },
      })}
    </span>
  );
}
