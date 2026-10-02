<script lang="ts">
  import { usePageList, type PageRef } from '@embedpdf/svelte/runtime';
  import { useRender } from '@embedpdf/svelte/render';

  interface Thumbnail {
    page: PageRef;
    url: string;
  }

  const render = useRender();
  const pages = usePageList();
  let thumbnails = $state.raw<Thumbnail[]>([]);
  let selected = $state(0);
  let preview = $state<string | null>(null);

  // A small picture of every page, a few rendered at a time.
  $effect(() => {
    const refs = pages.current.map((page) => page.ref);
    const controller = new AbortController();
    const revokes: (() => void)[] = [];
    (async () => {
      const { applied } = await render.renderPages(refs, { width: 120, signal: controller.signal });
      const ready = await Promise.all(
        applied.map(async ({ page, image }) => {
          const { url, revoke } = await image.objectUrl();
          revokes.push(revoke);
          return { page, url };
        }),
      );
      if (!controller.signal.aborted) thumbnails = ready;
    })().catch(() => {
      // cancelled: the document closed or the list changed
    });
    return () => {
      controller.abort();
      revokes.forEach((revoke) => revoke());
    };
  });

  // The chosen page, exactly 640 pixels wide.
  $effect(() => {
    const page = selected;
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    (async () => {
      const image = await render.renderPage(page, { width: 640, signal: controller.signal });
      const object = await image.objectUrl();
      if (controller.signal.aborted) {
        object.revoke();
        return;
      }
      revoke = object.revoke;
      preview = object.url;
    })().catch(() => {
      // cancelled: another page was picked
    });
    return () => {
      controller.abort();
      revoke?.();
    };
  });
</script>

<div class="images">
  <div class="strip" role="listbox" aria-label="Pages">
    {#each thumbnails as { page, url }, index (page.objectNumber)}
      <button
        type="button"
        role="option"
        class="thumbnail"
        aria-selected={index === selected}
        onclick={() => (selected = index)}
      >
        <img src={url} alt="Page {index + 1}" />
        <span>{index + 1}</span>
      </button>
    {/each}
  </div>
  <div class="preview">
    {#if preview}
      <img src={preview} alt="Page {selected + 1}, 640 pixels wide" />
    {/if}
  </div>
</div>
