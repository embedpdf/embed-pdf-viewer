import { h } from 'preact';
import { useCallback } from 'preact/hooks';
import { Icon } from './ui/icon';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { useUICapability } from '@embedpdf/plugin-ui/preact';
import { useDocumentState } from '@embedpdf/core/preact';
import { PdfPermissionFlag } from '@embedpdf/models';

interface UnlockOwnerOverlayProps {
  documentId: string;
}

export function UnlockOwnerOverlay({ documentId }: UnlockOwnerOverlayProps) {
  const { translate } = useTranslations(documentId);
  const { provides: ui } = useUICapability();
  const documentState = useDocumentState(documentId);

  // Get document security info
  const document = documentState?.document;
  const isEncrypted = document?.isEncrypted ?? false;
  const isOwnerUnlocked = document?.isOwnerUnlocked ?? false;
  const permissions = document?.permissions ?? PdfPermissionFlag.AllowAll;

  // Only show overlay if document is encrypted, owner is NOT unlocked, and permissions are restricted
  const hasRestrictedPermissions =
    (permissions & PdfPermissionFlag.AllowAll) !== PdfPermissionFlag.AllowAll;
  const shouldShow = isEncrypted && !isOwnerUnlocked && hasRestrictedPermissions;

  const handleDismiss = useCallback(() => {
    ui?.forDocument(documentId).disableOverlay('unlock-owner-overlay');
  }, [documentId, ui]);

  const handleViewPermissions = useCallback(() => {
    ui?.forDocument(documentId).disableOverlay('unlock-owner-overlay');
    ui?.forDocument(documentId).openModal('view-permissions-modal');
  }, [documentId, ui]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="">
      <div className="bg-bg-surface border-border-default flex max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg">
        {/* Lock Icon */}
        <div className="bg-accent/10 flex-shrink-0 rounded-full p-2">
          <Icon icon="lock" size={20} className="text-accent" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h3 className="text-fg-primary text-sm font-semibold">
            {translate('security.protected.title')}
          </h3>
          <p className="text-fg-secondary mt-1 text-xs leading-relaxed">
            {translate('security.protected.description')}
          </p>
          <button
            type="button"
            onClick={handleViewPermissions}
            className="text-accent hover:text-accent-hover mt-2 text-xs font-medium"
          >
            {translate('security.protected.viewPermissions')}
          </button>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="text-fg-muted hover:text-fg-secondary -mr-1 -mt-1 flex-shrink-0 p-1"
          aria-label={translate('common.close')}
        >
          <Icon icon="x" size={16} />
        </button>
      </div>
    </div>
  );
}
