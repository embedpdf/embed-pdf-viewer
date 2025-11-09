<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CloseIcon } from '../icons';

  interface DialogProps {
    /** Controlled visibility — `true` shows, `false` hides */
    open: boolean;
    /** Dialog title */
    title?: string;
    /** Dialog content */
    children: Snippet;
    /** Callback when dialog should close */
    onClose?: () => void;
    /** Optional className for the dialog content */
    class?: string;
    /** Whether to show close button */
    showCloseButton?: boolean;
    /** Maximum width of the dialog */
    maxWidth?: string;
  }

  let {
    open,
    title,
    children,
    onClose,
    class: className,
    showCloseButton = true,
    maxWidth = '32rem',
  }: DialogProps = $props();

  let overlayRef: HTMLDivElement | null = $state(null);

  // Handle escape key
  $effect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  });

  // Handle backdrop click
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === overlayRef) {
      onClose?.();
    }
  };

  // Prevent body scroll when dialog is open
  $effect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  });
</script>

{#if open}
  <div
    bind:this={overlayRef}
    class="fixed inset-0 z-50 bg-black/50 md:flex md:items-center md:justify-center"
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
  >
    <div
      class="relative flex h-full w-full flex-col bg-white md:h-auto md:w-[28rem] md:max-w-[90vw] md:rounded-lg md:border md:border-gray-200 md:shadow-lg {className ||
        ''}"
      style="max-width: {maxWidth}"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      {#if title || showCloseButton}
        <div
          class="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4"
        >
          {#if title}
            <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
          {/if}
          {#if showCloseButton}
            <button
              onclick={onClose}
              class="rounded p-1 hover:bg-gray-100"
              aria-label="Close dialog"
            >
              <CloseIcon class="h-5 w-5" />
            </button>
          {/if}
        </div>
      {/if}

      <!-- Content -->
      <div class="flex-1 space-y-6 overflow-y-auto px-6 py-4 md:max-h-[80vh] md:flex-none">
        {@render children()}
      </div>
    </div>
  </div>
{/if}
