<script setup lang="ts">
import { LinkLayer } from '@embedpdf/vue/link';
</script>

<template>
  <LinkLayer>
    <template #link="{ link, native }">
      <span class="pdf-link" :title="link.target.kind === 'uri' ? link.target.uri : undefined">
        <component :is="native" />
      </span>
    </template>
  </LinkLayer>
</template>
