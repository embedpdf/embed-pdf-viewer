<script lang="ts">
  import type { DocumentState } from '@embedpdf/core';
  import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/svelte';

  interface DocumentPasswordPromptProps {
    documentState: DocumentState | null;
  }

  let { documentState }: DocumentPasswordPromptProps = $props();

  const documentManager = useDocumentManagerCapability();

  let password = $state('');
  let error = $state('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!documentState?.id || !password) return;

    documentManager.provides?.providePassword(documentState.id, password);
    password = '';
    error = '';
  };
</script>

<div class="flex h-full items-center justify-center bg-gray-50 p-8">
  <div class="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
    <h2 class="mb-4 text-xl font-semibold text-gray-900">Document Password Required</h2>
    <p class="mb-4 text-sm text-gray-600">
      This document is password protected. Please enter the password to continue.
    </p>

    <form onsubmit={handleSubmit} class="space-y-4">
      <div>
        <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Enter password"
          autocomplete="off"
        />
      </div>

      {#if error}
        <div class="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      {/if}

      <button
        type="submit"
        class="w-full rounded-md bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Unlock Document
      </button>
    </form>
  </div>
</div>
