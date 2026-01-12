<script lang="ts">
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import { PdfPermissionFlag } from '@embedpdf/models';
  import { LockIcon, CloseIcon } from './icons';

  interface UnlockOwnerOverlayProps {
    documentId: string;
    onViewPermissions?: () => void;
    onDismiss?: () => void;
  }

  let { documentId, onViewPermissions, onDismiss }: UnlockOwnerOverlayProps = $props();

  const documentState = useDocumentState(() => documentId);
  const { translate } = useTranslations(() => documentId);

  let isDismissed = $state(false);

  // Get document security info
  const document = $derived(documentState.current?.document);
  const isEncrypted = $derived(document?.isEncrypted ?? false);
  const isOwnerUnlocked = $derived(document?.isOwnerUnlocked ?? false);
  const permissions = $derived(document?.permissions ?? PdfPermissionFlag.AllowAll);

  // Only show overlay if document is encrypted, owner is NOT unlocked, and permissions are restricted
  const hasRestrictedPermissions = $derived(
    (permissions & PdfPermissionFlag.AllowAll) !== PdfPermissionFlag.AllowAll,
  );
  const shouldShow = $derived(
    isEncrypted && !isOwnerUnlocked && hasRestrictedPermissions && !isDismissed,
  );

  const handleDismiss = () => {
    isDismissed = true;
    onDismiss?.();
  };

  const handleViewPermissions = () => {
    onViewPermissions?.();
  };
</script>

{#if shouldShow}
  <div class="pointer-events-auto">
    <div
      class="flex max-w-sm items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
    >
      <!-- Lock Icon -->
      <div class="flex-shrink-0 rounded-full bg-blue-100 p-2">
        <LockIcon class="h-5 w-5 text-blue-600" />
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        <h3 class="text-sm font-semibold text-gray-900">
          {translate('security.protected.title', { fallback: 'Protected Document' })}
        </h3>
        <p class="mt-1 text-xs leading-relaxed text-gray-600">
          {translate('security.protected.description', {
            fallback: 'This document has restricted permissions. Some features may be limited.',
          })}
        </p>
        <button
          type="button"
          onclick={handleViewPermissions}
          class="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {translate('security.protected.viewPermissions', { fallback: 'View Permissions' })}
        </button>
      </div>

      <!-- Close Button -->
      <button
        type="button"
        onclick={handleDismiss}
        class="-mr-1 -mt-1 flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
        aria-label={translate('common.close', { fallback: 'Close' })}
      >
        <CloseIcon class="h-4 w-4" />
      </button>
    </div>
  </div>
{/if}
