import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { useDocumentState } from '@embedpdf/core/preact';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/preact';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Spinner } from './ui/loading-indicator';
import { PermissionsDisplay } from './permissions-display';

interface ViewPermissionsModalProps {
  documentId: string;
  isOpen?: boolean;
  onClose?: () => void;
  onExited?: () => void;
}

export function ViewPermissionsModal({
  documentId,
  isOpen,
  onClose,
  onExited,
}: ViewPermissionsModalProps) {
  const { translate } = useTranslations(documentId);
  const documentState = useDocumentState(documentId);
  const { provides: documentManager } = useDocumentManagerCapability();

  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get document security info
  const document = documentState?.document;
  const permissions = document?.permissions ?? 0;
  const isOwnerUnlocked = document?.isOwnerUnlocked ?? false;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setOwnerPassword('');
      setShowPassword(false);
      setIsUnlocking(false);
      setError(null);
    }
  }, [isOpen]);

  const handleUnlock = () => {
    if (!documentManager || !ownerPassword) return;

    setIsUnlocking(true);
    setError(null);

    const task = documentManager.unlockOwnerPermissions(documentId, ownerPassword);

    task.wait(
      (success) => {
        setIsUnlocking(false);
        if (success) {
          // Success - modal will re-render with updated permissions
          setOwnerPassword('');
        } else {
          setError(translate('security.unlock.invalidPassword'));
        }
      },
      (err) => {
        setIsUnlocking(false);
        setError(err.reason?.message ?? translate('security.unlock.failed'));
      },
    );
  };

  return (
    <Dialog
      open={isOpen ?? false}
      title={translate('security.viewPermissions.title')}
      onClose={onClose}
      onExited={onExited}
      className="md:w-[32rem]"
    >
      <div className="space-y-5">
        {/* Description */}
        <p className="text-fg-secondary text-sm">
          {translate('security.viewPermissions.description')}
        </p>

        {/* Owner Password Entry (only if not unlocked) */}
        {!isOwnerUnlocked && (
          <div>
            <label className="text-fg-primary mb-2 block text-sm font-medium">
              {translate('security.unlock.label')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={ownerPassword}
                onInput={(e) => setOwnerPassword((e.target as HTMLInputElement).value)}
                placeholder={translate('security.unlock.placeholder')}
                className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && ownerPassword) {
                    handleUnlock();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-fg-muted hover:text-fg-secondary absolute right-2 top-1/2 -translate-y-1/2"
              >
                <Icon icon={showPassword ? 'eye-off' : 'eye'} className="h-4 w-4" />
              </button>
            </div>
            {error && <p className="text-state-error mt-2 text-xs">{error}</p>}
            <Button
              onClick={handleUnlock}
              disabled={!ownerPassword || isUnlocking}
              className="bg-accent text-fg-on-accent hover:!bg-accent-hover mt-3 flex items-center space-x-2 rounded-md px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUnlocking && <Spinner size="sm" />}
              <span>{translate('security.unlock.button')}</span>
            </Button>
          </div>
        )}

        {/* Success message when unlocked */}
        {isOwnerUnlocked && (
          <div className="bg-state-success-light flex items-center space-x-2 rounded-md p-3">
            <Icon icon="check" className="text-state-success h-4 w-4 flex-shrink-0" />
            <p className="text-fg-secondary text-sm">{translate('security.unlock.success')}</p>
          </div>
        )}

        {/* Permissions List */}
        <PermissionsDisplay permissions={permissions} translate={translate} />

        {/* Actions */}
        <div className="border-border-subtle flex justify-end border-t pt-4">
          <Button
            onClick={onClose}
            className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm"
          >
            {translate('common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
