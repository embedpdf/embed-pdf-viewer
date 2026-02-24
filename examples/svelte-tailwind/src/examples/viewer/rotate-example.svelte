<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    PDFViewer,
    type EmbedPdfContainer,
    type PluginRegistry,
    type RotatePlugin,
    type RotateScope,
  } from '@embedpdf/svelte-pdf-viewer';
  import { RotateCw, RotateCcw } from 'lucide-svelte';

  interface Props {
    themePreference?: 'light' | 'dark';
  }

  let { themePreference = 'light' }: Props = $props();

  let container = $state<EmbedPdfContainer | null>(null);
  let rotate = $state<RotateScope | null>(null);
  let currentRotation = $state(0);
  let cleanups: (() => void)[] = [];

  const handleInit = (c: EmbedPdfContainer) => {
    container = c;
  };

  const handleReady = (registry: PluginRegistry) => {
    const rotatePlugin = registry.getPlugin<RotatePlugin>('rotate')?.provides();
    const docRotate = rotatePlugin?.forDocument('ebook');

    if (docRotate) {
      rotate = docRotate;
      currentRotation = docRotate.getRotation();

      const cleanup = docRotate.onRotateChange((rotation) => {
        currentRotation = rotation;
      });
      cleanups.push(cleanup);
    }
  };

  $effect(() => {
    container?.setTheme({ preference: themePreference });
  });

  onDestroy(() => {
    cleanups.forEach((cleanup) => cleanup());
  });
</script>

<div class="flex flex-col gap-4">
  <!-- External Controls -->
  <div
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
  >
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => rotate?.rotateBackward()}
          class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
          title="Rotate Counter-Clockwise"
        >
          <RotateCcw size={20} />
        </button>
        <button
          type="button"
          onclick={() => rotate?.rotateForward()}
          class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
          title="Rotate Clockwise"
        >
          <RotateCw size={20} />
        </button>
      </div>
      <span class="font-mono text-sm font-medium text-gray-600 dark:text-gray-300">
        Rotation: {currentRotation * 90}°
      </span>
    </div>
  </div>

  <!-- Viewer -->
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
              documentId: 'ebook',
            },
          ],
        },
      }}
      style="width: 100%; height: 100%;"
    />
  </div>
</div>
