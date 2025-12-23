<script lang="ts">
  import { type DocumentState } from '@embedpdf/core';
  import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { Scroller, type RenderPageProps } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { TilingLayer } from '@embedpdf/plugin-tiling/svelte';
  import { PdfErrorCode } from '@embedpdf/models';
  import { Lock, AlertCircle, X, Eye, EyeOff, FileText, Loader2 } from 'lucide-svelte';

  interface Props {
    documentState: DocumentState;
    documentId?: string;
    isLoaded?: boolean;
  }

  let { documentState, documentId, isLoaded = false }: Props = $props();

  const docManager = useDocumentManagerCapability();

  let password = $state('');
  let showPassword = $state(false);
  let isRetrying = $state(false);

  const isPasswordError = $derived(documentState?.errorCode === PdfErrorCode.Password);
  const isPasswordRequired = $derived(isPasswordError && !documentState?.passwordProvided);
  const isPasswordIncorrect = $derived(isPasswordError && documentState?.passwordProvided);

  const handleRetry = () => {
    if (!docManager.provides || !password.trim()) return;
    isRetrying = true;

    const task = docManager.provides.retryDocument(documentState.id, { password });
    task.wait(
      () => {
        password = '';
        isRetrying = false;
      },
      (error) => {
        console.error('Retry failed:', error);
        isRetrying = false;
      },
    );
  };

  const handleClose = () => {
    docManager.provides?.closeDocument(documentState.id);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isRetrying && password.trim()) {
      handleRetry();
    }
  };
</script>

<!-- Loaded state - show the PDF viewer -->
{#if isLoaded && documentId}
  {#snippet renderPage(page: RenderPageProps)}
    <div style:width="{page.width}px" style:height="{page.height}px" style:position="relative">
      <RenderLayer {documentId} pageIndex={page.pageIndex} />
      <TilingLayer {documentId} pageIndex={page.pageIndex} />
    </div>
  {/snippet}
  <div class="relative h-[400px] sm:h-[500px]">
    <Viewport {documentId} class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
      <Scroller {documentId} {renderPage} />
    </Viewport>
  </div>
{:else if !isPasswordError}
  <!-- Generic error state (non-password errors) -->
  <div class="flex h-full items-center justify-center p-8">
    <div class="w-full max-w-sm text-center">
      <div
        class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
      >
        <AlertCircle class="h-6 w-6 text-red-600 dark:text-red-400" />
      </div>
      <h3 class="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
        Error loading document
      </h3>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {documentState?.error || 'An unknown error occurred'}
      </p>
      {#if documentState?.errorCode}
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-500">
          Error code: {documentState.errorCode}
        </p>
      {/if}
      <button
        type="button"
        onclick={handleClose}
        class="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600"
      >
        Close Document
      </button>
    </div>
  </div>
{:else}
  <!-- Password prompt -->
  <div class="flex h-full items-center justify-center p-4 sm:p-8">
    <div
      class="w-full max-w-sm overflow-hidden rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      <!-- Header -->
      <div
        class="flex items-start justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-700"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30"
          >
            <Lock class="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Password Required
            </h3>
            {#if documentState?.name}
              <p
                class="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500 dark:text-gray-400"
              >
                <FileText size={12} />
                {documentState.name}
              </p>
            {/if}
          </div>
        </div>
        <button
          type="button"
          onclick={handleClose}
          disabled={isRetrying}
          class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <X size={16} />
        </button>
      </div>

      <!-- Content -->
      <div class="p-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {#if isPasswordRequired}
            This document is protected. Enter the password to view it.
          {/if}
          {#if isPasswordIncorrect}
            Incorrect password. Please try again.
          {/if}
        </p>

        <!-- Password Input -->
        <div class="mt-4">
          <label class="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">
            Password
          </label>
          <div class="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              bind:value={password}
              onkeydown={handleKeyDown}
              disabled={isRetrying}
              placeholder="Enter password"
              class={[
                'block w-full rounded-md border bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500',
                isPasswordIncorrect
                  ? 'border-red-300 dark:border-red-700'
                  : 'border-gray-300 dark:border-gray-600',
              ].join(' ')}
            />
            <button
              type="button"
              onclick={() => (showPassword = !showPassword)}
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {#if showPassword}
                <EyeOff size={16} />
              {:else}
                <Eye size={16} />
              {/if}
            </button>
          </div>
        </div>

        <!-- Error message -->
        {#if isPasswordIncorrect}
          <div class="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle size={14} />
            <span>The password you entered is incorrect</span>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50"
      >
        <button
          type="button"
          onclick={handleClose}
          disabled={isRetrying}
          class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={handleRetry}
          disabled={isRetrying || !password.trim()}
          class="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {#if isRetrying}
            <Loader2 size={14} class="animate-spin" />
            Opening...
          {:else}
            Unlock
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
