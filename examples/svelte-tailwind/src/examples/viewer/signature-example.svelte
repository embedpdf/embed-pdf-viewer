<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type SignaturePlugin,
    type SignatureCapability,
    serializeEntries,
    deserializeEntries,
  } from '@embedpdf/svelte-pdf-viewer';
  import { Save, Upload, Trash2, HardDrive } from 'lucide-svelte';

  const STORAGE_KEY = 'embedpdf-signatures';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let signatureApi = $state<SignatureCapability | null>(null);
  let entryCount = $state(0);
  let autoSave = $state(true);
  let status = $state<string | null>(null);
  let storedCount = $state(
    (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as unknown[]).length : 0;
      } catch {
        return 0;
      }
    })(),
  );
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const api = registry.getPlugin<SignaturePlugin>('signature')?.provides();
    if (!api) return;

    signatureApi = api;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const entries = deserializeEntries(JSON.parse(raw));
        api.loadEntries(entries);
        status = `Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''} from storage`;
      } catch {
        status = 'Failed to load saved signatures';
      }
    }

    entryCount = api.getEntries().length;

    const cleanupEntries = api.onEntriesChange((entries) => {
      entryCount = entries.length;
    });
    cleanups.push(cleanupEntries);
  };

  let autoSaveCleanup: (() => void) | undefined;

  $effect(() => {
    autoSaveCleanup?.();
    autoSaveCleanup = undefined;

    if (!signatureApi || !autoSave) return;

    autoSaveCleanup = signatureApi.onEntriesChange((entries) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(entries)));
      storedCount = entries.length;
      status = `Auto-saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`;
    });
  });

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    autoSaveCleanup?.();
    cleanups.forEach((cleanup) => cleanup());
  });

  const handleSave = () => {
    if (!signatureApi) return;
    const entries = signatureApi.exportEntries();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeEntries(entries)));
    storedCount = entries.length;
    status = `Saved ${entries.length} signature${entries.length !== 1 ? 's' : ''}`;
  };

  const handleLoad = () => {
    if (!signatureApi) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      status = 'No saved signatures found';
      return;
    }
    try {
      const entries = deserializeEntries(JSON.parse(raw));
      signatureApi.loadEntries(entries);
      status = `Loaded ${entries.length} signature${entries.length !== 1 ? 's' : ''}`;
    } catch {
      status = 'Failed to load signatures';
    }
  };

  const handleClearStorage = () => {
    localStorage.removeItem(STORAGE_KEY);
    storedCount = 0;
    status = 'Storage cleared';
  };
</script>

<div class="flex flex-col gap-4">
  <div
    class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Persistence
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={handleSave}
          disabled={entryCount === 0}
          class="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={14} />
          Save ({entryCount})
        </button>
        <button
          type="button"
          onclick={handleLoad}
          disabled={storedCount === 0}
          class="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload size={14} />
          Load{storedCount > 0 ? ` (${storedCount})` : ''}
        </button>
        <button
          type="button"
          onclick={handleClearStorage}
          disabled={storedCount === 0}
          class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} />
          Clear Storage
        </button>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <label
        class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"
      >
        <input type="checkbox" bind:checked={autoSave} class="accent-emerald-500" />
        Auto-save
      </label>

      {#if status}
        <span class="text-xs text-gray-500 dark:text-gray-400">{status}</span>
      {/if}
    </div>
    {#if storedCount > 0}
      <div class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <HardDrive size={12} />
        {storedCount} signature{storedCount !== 1 ? 's' : ''} in localStorage
      </div>
    {/if}
  </div>

  <div
    class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
  >
    <PDFViewer
      oninit={handleInit}
      onready={handleReady}
      config={{
        theme: { preference: themePreference },
        documentManager: {
          initialDocuments: [
            {
              url: 'https://snippet.embedpdf.com/ebook.pdf',
              documentId: 'signature-doc',
            },
          ],
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>
