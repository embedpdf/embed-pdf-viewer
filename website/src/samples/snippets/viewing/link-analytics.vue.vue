<script setup lang="ts">
import { LinkLayer, useLinkEvent } from '@embedpdf/vue/link';
import { RenderLayer } from '@embedpdf/vue/render';
import { Stage } from '@embedpdf/vue/stage';
import { analytics } from './analytics';

useLinkEvent(
  (link) => link.onActivated,
  ({ target }) => analytics.track('link_followed', { kind: target.kind }),
);
</script>

<template>
  <Stage>
    <template #page>
      <RenderLayer />
      <LinkLayer />
    </template>
  </Stage>
</template>
