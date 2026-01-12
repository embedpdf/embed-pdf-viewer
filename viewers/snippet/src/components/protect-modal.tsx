import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Spinner } from './ui/loading-indicator';
import { PermissionsDisplay, PERMISSION_OPTIONS } from './permissions-display';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/preact';
import { useDocumentState } from '@embedpdf/core/preact';
import { PdfPermissionFlag } from '@embedpdf/models';

interface ProtectModalProps {
  documentId: string;
  isOpen?: boolean;
  onClose?: () => void;
  onExited?: () => void;
}

type ModalStep = 'unlock' | 'choose-action' | 'edit-protection' | 'remove-protection';

export function ProtectModal({ documentId, isOpen, onClose, onExited }: ProtectModalProps) {
  const { translate } = useTranslations(documentId);
  const { provides: documentManager } = useDocumentManagerCapability();
  const documentState = useDocumentState(documentId);

  // Get document security info
  const document = documentState?.document;
  const isEncrypted = document?.isEncrypted ?? false;
  const isOwnerUnlocked = document?.isOwnerUnlocked ?? false;
  const permissions = document?.permissions ?? 0;

  // Modal step state
  const [step, setStep] = useState<ModalStep>('edit-protection');

  // Unlock password state (for encrypted docs where owner is not unlocked)
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Document open password state
  const [requireOpenPassword, setRequireOpenPassword] = useState(false);
  const [openPassword, setOpenPassword] = useState('');
  const [confirmOpenPassword, setConfirmOpenPassword] = useState('');
  const [showOpenPassword, setShowOpenPassword] = useState(false);

  // Permissions state
  const [restrictPermissions, setRestrictPermissions] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmOwnerPassword, setConfirmOwnerPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [allowedPermissions, setAllowedPermissions] = useState<Set<PdfPermissionFlag>>(
    new Set(PERMISSION_OPTIONS.map((p) => p.flag)),
  );

  // Loading state
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine initial step based on document state
  useEffect(() => {
    if (isOpen) {
      // Reset all state
      setUnlockPassword('');
      setShowUnlockPassword(false);
      setIsUnlocking(false);
      setUnlockError(null);
      setRequireOpenPassword(false);
      setOpenPassword('');
      setConfirmOpenPassword('');
      setShowOpenPassword(false);
      setRestrictPermissions(false);
      setOwnerPassword('');
      setConfirmOwnerPassword('');
      setShowOwnerPassword(false);
      setAllowedPermissions(new Set(PERMISSION_OPTIONS.map((p) => p.flag)));
      setIsApplying(false);
      setError(null);

      // Determine initial step
      if (isEncrypted && !isOwnerUnlocked) {
        setStep('unlock');
      } else if (isEncrypted && isOwnerUnlocked) {
        setStep('choose-action');
      } else {
        setStep('edit-protection');
      }
    }
  }, [isOpen, isEncrypted, isOwnerUnlocked]);

  const togglePermission = (flag: PdfPermissionFlag) => {
    setAllowedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) {
        next.delete(flag);
      } else {
        next.add(flag);
        // If enabling PrintHighQuality, ensure Print is also enabled
        if (flag === PdfPermissionFlag.PrintHighQuality) {
          next.add(PdfPermissionFlag.Print);
        }
      }
      return next;
    });
  };

  // Validation
  const openPasswordsMatch = openPassword === confirmOpenPassword;
  const ownerPasswordsMatch = ownerPassword === confirmOwnerPassword;
  const hasOpenPassword = !requireOpenPassword || (openPassword.length > 0 && openPasswordsMatch);
  const hasOwnerPassword =
    !restrictPermissions || (ownerPassword.length > 0 && ownerPasswordsMatch);
  const canApplyProtection =
    (requireOpenPassword || restrictPermissions) &&
    hasOpenPassword &&
    hasOwnerPassword &&
    !isApplying;

  const handleUnlock = () => {
    if (!documentManager || !unlockPassword) return;

    setIsUnlocking(true);
    setUnlockError(null);

    const task = documentManager.unlockOwnerPermissions(documentId, unlockPassword);

    task.wait(
      (success) => {
        setIsUnlocking(false);
        if (success) {
          setStep('choose-action');
        } else {
          setUnlockError(translate('security.unlock.invalidPassword'));
        }
      },
      (err) => {
        setIsUnlocking(false);
        setUnlockError(err.reason?.message ?? translate('security.unlock.failed'));
      },
    );
  };

  const handleApplyProtection = () => {
    if (!canApplyProtection || !documentManager) return;

    // Build the allowed permissions number
    let permissionFlags = 0;
    if (restrictPermissions) {
      for (const flag of allowedPermissions) {
        permissionFlags |= flag;
      }
    } else {
      // If not restricting permissions, allow all
      permissionFlags = PdfPermissionFlag.AllowAll;
    }

    // Determine the passwords to use
    const userPwd = requireOpenPassword ? openPassword : '';
    const ownerPwd = restrictPermissions ? ownerPassword : requireOpenPassword ? openPassword : '';

    setIsApplying(true);
    setError(null);

    const task = documentManager.setDocumentEncryption(documentId, {
      userPassword: userPwd,
      ownerPassword: ownerPwd,
      allowedFlags: permissionFlags,
    });

    task.wait(
      (success) => {
        setIsApplying(false);
        if (success) {
          onClose?.();
        } else {
          setError(translate('protect.applyFailed'));
        }
      },
      (err) => {
        setIsApplying(false);
        setError(err.reason?.message ?? translate('protect.applyFailed'));
      },
    );
  };

  const handleRemoveProtection = () => {
    if (!documentManager) return;

    setIsApplying(true);
    setError(null);

    const task = documentManager.removeEncryption(documentId);

    task.wait(
      (success) => {
        setIsApplying(false);
        if (success) {
          onClose?.();
        } else {
          setError(translate('protect.removeFailed'));
        }
      },
      (err) => {
        setIsApplying(false);
        setError(err.reason?.message ?? translate('protect.removeFailed'));
      },
    );
  };

  const getTitle = () => {
    switch (step) {
      case 'unlock':
        return translate('protect.encrypted.title');
      case 'choose-action':
        return translate('protect.modifyProtection.title');
      case 'remove-protection':
        return translate('protect.removeProtection.title');
      case 'edit-protection':
      default:
        return translate('protect.title');
    }
  };

  const renderUnlockStep = () => (
    <div className="space-y-5">
      <p className="text-fg-secondary text-sm">{translate('protect.encrypted.description')}</p>

      <div>
        <label className="text-fg-primary mb-2 block text-sm font-medium">
          {translate('protect.encrypted.enterOwnerPassword')}
        </label>
        <div className="relative">
          <input
            type={showUnlockPassword ? 'text' : 'password'}
            value={unlockPassword}
            onInput={(e) => setUnlockPassword((e.target as HTMLInputElement).value)}
            placeholder={translate('protect.ownerPassword.placeholder')}
            className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && unlockPassword) {
                handleUnlock();
              }
            }}
          />
          <button
            type="button"
            onClick={() => setShowUnlockPassword(!showUnlockPassword)}
            className="text-fg-muted hover:text-fg-secondary absolute right-2 top-1/2 -translate-y-1/2"
          >
            <Icon icon={showUnlockPassword ? 'eye-off' : 'eye'} className="h-4 w-4" />
          </button>
        </div>
        {unlockError && <p className="text-state-error mt-2 text-xs">{unlockError}</p>}
      </div>

      <PermissionsDisplay permissions={permissions} translate={translate} />

      <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
        <Button
          onClick={handleUnlock}
          disabled={!unlockPassword || isUnlocking}
          className="bg-accent text-fg-on-accent hover:!bg-accent-hover flex items-center space-x-2 rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUnlocking && <Spinner size="sm" />}
          <span>{translate('protect.encrypted.unlockAndEdit')}</span>
        </Button>
      </div>
    </div>
  );

  const renderChooseActionStep = () => (
    <div className="space-y-5">
      <p className="text-fg-secondary text-sm">
        {translate('protect.modifyProtection.description')}
      </p>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setStep('edit-protection')}
          className="border-border-default hover:border-accent hover:bg-bg-subtle flex w-full items-center rounded-lg border p-4 text-left transition-colors"
        >
          <div className="bg-accent/10 mr-4 rounded-full p-2">
            <Icon icon="lock" size={20} className="text-accent" />
          </div>
          <div>
            <span className="text-fg-primary block font-medium">
              {translate('protect.modifyProtection.changeOption')}
            </span>
            <span className="text-fg-muted text-sm">
              {translate('protect.modifyProtection.changeDescription')}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('remove-protection')}
          className="border-border-default hover:border-state-error hover:bg-state-error-light flex w-full items-center rounded-lg border p-4 text-left transition-colors"
        >
          <div className="bg-state-error-light mr-4 rounded-full p-2">
            <Icon icon="unlock" size={20} className="text-state-error" />
          </div>
          <div>
            <span className="text-fg-primary block font-medium">
              {translate('protect.modifyProtection.removeOption')}
            </span>
            <span className="text-fg-muted text-sm">
              {translate('protect.modifyProtection.removeDescription')}
            </span>
          </div>
        </button>
      </div>

      <div className="border-border-subtle flex justify-end border-t pt-4">
        <Button
          onClick={onClose}
          className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm"
        >
          {translate('protect.cancel')}
        </Button>
      </div>
    </div>
  );

  const renderRemoveProtectionStep = () => (
    <div className="space-y-5">
      <div className="bg-state-warning-light flex items-start space-x-3 rounded-lg p-4">
        <Icon icon="alertTriangle" className="text-state-warning mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <p className="text-fg-primary font-medium">
            {translate('protect.removeProtection.warning')}
          </p>
          <p className="text-fg-secondary mt-1 text-sm">
            {translate('protect.removeProtection.description')}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-state-error-light flex items-start space-x-2 rounded-md p-3">
          <Icon icon="alertTriangle" className="text-state-error mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-state-error text-sm">{error}</p>
        </div>
      )}

      <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
        <Button
          onClick={() => setStep('choose-action')}
          disabled={isApplying}
          className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {translate('common.back')}
        </Button>
        <Button
          onClick={handleRemoveProtection}
          disabled={isApplying}
          className="bg-state-error text-fg-on-accent hover:bg-state-error/90 flex items-center space-x-2 rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isApplying && <Spinner size="sm" />}
          <span>{translate('protect.removeProtection.confirm')}</span>
        </Button>
      </div>
    </div>
  );

  const renderEditProtectionStep = () => (
    <div className="space-y-6">
      {/* Document Open Password Section */}
      <div className="bg-bg-subtle rounded-lg">
        <label className="flex cursor-pointer items-start">
          <input
            type="checkbox"
            checked={requireOpenPassword}
            onChange={(e) => setRequireOpenPassword((e.target as HTMLInputElement).checked)}
            className="accent-accent mr-3 mt-0.5"
          />
          <div className="flex-1">
            <span className="text-fg-primary block font-medium">
              {translate('protect.openPassword.title')}
            </span>
            <span className="text-fg-muted text-sm">
              {translate('protect.openPassword.description')}
            </span>
          </div>
        </label>

        {requireOpenPassword && (
          <div className="mt-4 space-y-3 pl-6">
            <div>
              <label className="text-fg-secondary mb-1 block text-sm">
                {translate('protect.openPassword.label')}
              </label>
              <div className="relative">
                <input
                  type={showOpenPassword ? 'text' : 'password'}
                  value={openPassword}
                  onInput={(e) => setOpenPassword((e.target as HTMLInputElement).value)}
                  placeholder={translate('protect.openPassword.placeholder')}
                  className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenPassword(!showOpenPassword)}
                  className="text-fg-muted hover:text-fg-secondary absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <Icon icon={showOpenPassword ? 'eye-off' : 'eye'} className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="text-fg-secondary mb-1 block text-sm">
                {translate('protect.openPassword.confirm')}
              </label>
              <input
                type={showOpenPassword ? 'text' : 'password'}
                value={confirmOpenPassword}
                onInput={(e) => setConfirmOpenPassword((e.target as HTMLInputElement).value)}
                placeholder={translate('protect.openPassword.confirmPlaceholder')}
                className={`border-border-default bg-bg-input text-fg-primary focus:ring-accent w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                  confirmOpenPassword && !openPasswordsMatch
                    ? 'border-state-error focus:border-state-error'
                    : 'focus:border-accent'
                }`}
              />
              {confirmOpenPassword && !openPasswordsMatch && (
                <p className="text-state-error mt-1 text-xs">
                  {translate('protect.passwordMismatch')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Permissions Section */}
      <div className="bg-bg-subtle rounded-lg">
        <label className="flex cursor-pointer items-start">
          <input
            type="checkbox"
            checked={restrictPermissions}
            onChange={(e) => setRestrictPermissions((e.target as HTMLInputElement).checked)}
            className="accent-accent mr-3 mt-0.5"
          />
          <div className="flex-1">
            <span className="text-fg-primary block font-medium">
              {translate('protect.permissions.title')}
            </span>
            <span className="text-fg-muted text-sm">
              {translate('protect.permissions.description')}
            </span>
          </div>
        </label>

        {restrictPermissions && (
          <div className="mt-4 space-y-4 pl-6">
            {/* Owner Password */}
            <div className="border-border-subtle border-b pb-4">
              <div>
                <label className="text-fg-secondary mb-1 block text-sm">
                  {translate('protect.ownerPassword.label')}
                </label>
                <div className="relative">
                  <input
                    type={showOwnerPassword ? 'text' : 'password'}
                    value={ownerPassword}
                    onInput={(e) => setOwnerPassword((e.target as HTMLInputElement).value)}
                    placeholder={translate('protect.ownerPassword.placeholder')}
                    className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                    className="text-fg-muted hover:text-fg-secondary absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <Icon icon={showOwnerPassword ? 'eye-off' : 'eye'} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <label className="text-fg-secondary mb-1 block text-sm">
                  {translate('protect.ownerPassword.confirm')}
                </label>
                <input
                  type={showOwnerPassword ? 'text' : 'password'}
                  value={confirmOwnerPassword}
                  onInput={(e) => setConfirmOwnerPassword((e.target as HTMLInputElement).value)}
                  placeholder={translate('protect.ownerPassword.confirmPlaceholder')}
                  className={`border-border-default bg-bg-input text-fg-primary focus:ring-accent w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                    confirmOwnerPassword && !ownerPasswordsMatch
                      ? 'border-state-error focus:border-state-error'
                      : 'focus:border-accent'
                  }`}
                />
                {confirmOwnerPassword && !ownerPasswordsMatch && (
                  <p className="text-state-error mt-1 text-xs">
                    {translate('protect.passwordMismatch')}
                  </p>
                )}
              </div>
            </div>

            {/* Permission Checkboxes */}
            <div>
              <label className="text-fg-secondary mb-2 block text-sm font-medium">
                {translate('protect.permissions.allowedActions')}
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PERMISSION_OPTIONS.map((option) => (
                  <label
                    key={option.flag}
                    className="hover:bg-bg-surface flex cursor-pointer items-center rounded-md p-2 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={allowedPermissions.has(option.flag)}
                      onChange={() => togglePermission(option.flag)}
                      className="accent-accent mr-2"
                    />
                    <span className="text-fg-primary text-sm">{translate(option.labelKey)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Note */}
      {requireOpenPassword && restrictPermissions && (
        <div className="bg-state-info-light flex items-start space-x-2 rounded-md p-3">
          <Icon icon="info" className="text-accent mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-fg-secondary text-sm">{translate('protect.bothPasswordsNote')}</p>
        </div>
      )}

      {/* No Protection Selected Warning */}
      {!requireOpenPassword && !restrictPermissions && !error && (
        <div className="bg-state-warning-light flex items-start space-x-2 rounded-md p-3">
          <Icon icon="alertTriangle" className="text-state-warning mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-fg-secondary text-sm">{translate('protect.noProtectionSelected')}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-state-error-light flex items-start space-x-2 rounded-md p-3">
          <Icon icon="alertTriangle" className="text-state-error mt-0.5 h-4 w-4 flex-shrink-0" />
          <p className="text-state-error text-sm">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
        {isEncrypted && isOwnerUnlocked && (
          <Button
            onClick={() => setStep('choose-action')}
            disabled={isApplying}
            className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate('common.back')}
          </Button>
        )}
        <Button
          onClick={handleApplyProtection}
          disabled={!canApplyProtection}
          className="bg-accent text-fg-on-accent hover:!bg-accent-hover flex items-center space-x-2 rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isApplying && <Spinner size="sm" />}
          <span>{isApplying ? translate('protect.applying') : translate('protect.apply')}</span>
        </Button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case 'unlock':
        return renderUnlockStep();
      case 'choose-action':
        return renderChooseActionStep();
      case 'remove-protection':
        return renderRemoveProtectionStep();
      case 'edit-protection':
      default:
        return renderEditProtectionStep();
    }
  };

  return (
    <Dialog
      open={isOpen ?? false}
      title={getTitle()}
      onClose={onClose}
      onExited={onExited}
      className="md:w-[36rem]"
    >
      {renderContent()}
    </Dialog>
  );
}
