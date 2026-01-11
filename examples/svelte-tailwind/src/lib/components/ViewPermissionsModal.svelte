<script lang="ts">
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/svelte';
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import { Dialog, Button } from './ui';
  import { EyeIcon, EyeOffIcon, CheckIcon } from './icons';
  import PermissionsDisplay from './PermissionsDisplay.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface ViewPermissionsModalProps {
    documentId: string;
    isOpen: boolean;
    onClose: () => void;
  }

  let { documentId, isOpen, onClose }: ViewPermissionsModalProps = $props();

  const documentState = useDocumentState(() => documentId);
  const documentManager = useDocumentManagerCapability();
  const { translate } = useTranslations(() => documentId);

  let ownerPassword = $state('');
  let showPassword = $state(false);
  let isUnlocking = $state(false);
  let error = $state<string | null>(null);

  // Get document security info
  const document = $derived(documentState.current?.document);
  const permissions = $derived(document?.permissions ?? 0);
  const isOwnerUnlocked = $derived(document?.isOwnerUnlocked ?? false);

  // Reset state when modal opens
  $effect(() => {
    if (isOpen) {
      ownerPassword = '';
      showPassword = false;
      isUnlocking = false;
      error = null;
    }
  });

  const handleUnlock = () => {
    if (!documentManager.provides || !ownerPassword) return;

    isUnlocking = true;
    error = null;

    const task = documentManager.provides.unlockOwnerPermissions(documentId, ownerPassword);

    task.wait(
      (success) => {
        isUnlocking = false;
        if (success) {
          // Success - modal will re-render with updated permissions
          ownerPassword = '';
        } else {
          error = translate('security.unlock.invalidPassword', {
            fallback: 'Invalid owner password. Please try again.',
          });
        }
      },
      (err) => {
        isUnlocking = false;
        error =
          err.reason?.message ??
          translate('security.unlock.failed', { fallback: 'Failed to unlock permissions.' });
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && ownerPassword) {
      handleUnlock();
    }
  };
</script>

<Dialog
  open={isOpen}
  {onClose}
  title={translate('security.viewPermissions.title', { fallback: 'Document Permissions' })}
  maxWidth="32rem"
>
  <div class="space-y-5">
    <!-- Description -->
    <p class="text-sm text-gray-600">
      {translate('security.viewPermissions.description', {
        fallback: 'This document is protected. Enter the owner password to unlock all permissions.',
      })}
    </p>

    <!-- Owner Password Entry (only if not unlocked) -->
    {#if !isOwnerUnlocked}
      <div>
        <label for="owner-password" class="mb-2 block text-sm font-medium text-gray-900">
          {translate('security.unlock.label', { fallback: 'Owner Password' })}
        </label>
        <div class="relative">
          <input
            id="owner-password"
            type={showPassword ? 'text' : 'password'}
            bind:value={ownerPassword}
            placeholder={translate('security.unlock.placeholder', {
              fallback: 'Enter owner password',
            })}
            class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onkeydown={handleKeyDown}
          />
          <button
            type="button"
            onclick={() => (showPassword = !showPassword)}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {#if showPassword}
              <EyeOffIcon class="h-4 w-4" />
            {:else}
              <EyeIcon class="h-4 w-4" />
            {/if}
          </button>
        </div>
        {#if error}
          <p class="mt-2 text-xs text-red-600">{error}</p>
        {/if}
        <Button
          onclick={handleUnlock}
          disabled={!ownerPassword || isUnlocking}
          variant="primary"
          class="mt-3 flex items-center space-x-2"
        >
          {#if isUnlocking}
            <LoadingSpinner size="sm" />
          {/if}
          <span>{translate('security.unlock.button', { fallback: 'Unlock' })}</span>
        </Button>
      </div>
    {/if}

    <!-- Success message when unlocked -->
    {#if isOwnerUnlocked}
      <div class="flex items-center space-x-2 rounded-md bg-green-50 p-3">
        <CheckIcon class="h-4 w-4 flex-shrink-0 text-green-600" />
        <p class="text-sm text-gray-700">
          {translate('security.unlock.success', {
            fallback: 'Full permissions unlocked successfully.',
          })}
        </p>
      </div>
    {/if}

    <!-- Permissions List -->
    <PermissionsDisplay {permissions} {translate} />

    <!-- Actions -->
    <div class="flex justify-end border-t border-gray-200 pt-4">
      <Button onclick={onClose} variant="secondary">
        {translate('common.close', { fallback: 'Close' })}
      </Button>
    </div>
  </div>
</Dialog>
