<!-- Your UI decides how a website opens: here, it asks first. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    useActions,
    useActionsUiAdapter,
    type ActionContext,
    type PdfActionTree,
  } from '@embedpdf/svelte/actions';

  // A link to a website, as a PDF carries it: what getActionTree() reads from a link.
  const websiteLink: PdfActionTree = {
    root: { type: 'uri', subtype: 'URI', uri: 'https://www.embedpdf.com', isMap: false, next: [] },
    incomplete: false,
    warningFlags: 0,
    warnings: [],
  };
  const click: ActionContext = {
    origin: 'user',
    source: { kind: 'api' },
    event: { scope: 'activate' },
  };

  const actions = useActions();
  let asking = $state<string | null>(null);

  useActionsUiAdapter({ openUri: (uri) => (asking = uri) });

  // The link is clicked once on load, so the question is there to see.
  onMount(() => {
    void actions.execute(websiteLink, click);
  });

  function openSite() {
    if (asking) window.open(asking, '_blank', 'noopener');
    asking = null;
  }
</script>

<section class="panel">
  <p class="lead">
    The document links to <code>https://www.embedpdf.com</code>.
  </p>
  <button type="button" class="button" onclick={() => actions.execute(websiteLink, click)}>
    Click the link
  </button>
  {#if asking}
    <div class="prompt" role="alertdialog" aria-label="Open a website">
      <p class="prompt-text">
        This document wants to open <strong>{asking}</strong>.
      </p>
      <div class="prompt-actions">
        <button type="button" class="button" onclick={() => (asking = null)}>Stay here</button>
        <button type="button" class="button primary" onclick={openSite}>
          Open in a new tab
        </button>
      </div>
    </div>
  {/if}
</section>
