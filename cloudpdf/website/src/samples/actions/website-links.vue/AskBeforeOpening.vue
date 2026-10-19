<!-- Your UI decides how a website opens: here, it asks first. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useActions, useActionsUiAdapter } from '@embedpdf/vue/actions';
import type { ActionContext, PdfActionTree } from '@embedpdf/vue/actions';

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
const asking = ref<string | null>(null);

useActionsUiAdapter({
  openUri: (uri) => {
    asking.value = uri;
  },
});

// The link is clicked once on load, so the question is there to see.
onMounted(() => {
  void actions.execute(websiteLink, click);
});

function openInNewTab(uri: string) {
  window.open(uri, '_blank', 'noopener');
  asking.value = null;
}
</script>

<template>
  <section class="panel">
    <p class="lead">The document links to <code>https://www.embedpdf.com</code>.</p>
    <button type="button" class="button" @click="actions.execute(websiteLink, click)">
      Click the link
    </button>
    <div v-if="asking" class="prompt" role="alertdialog" aria-label="Open a website">
      <p class="prompt-text">
        This document wants to open <strong>{{ asking }}</strong>.
      </p>
      <div class="prompt-actions">
        <button type="button" class="button" @click="asking = null">Stay here</button>
        <button type="button" class="button primary" @click="openInNewTab(asking)">
          Open in a new tab
        </button>
      </div>
    </div>
  </section>
</template>
