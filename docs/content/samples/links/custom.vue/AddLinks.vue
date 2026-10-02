<!-- Made on load, since the document has none: a label the page shows, and a link over it. -->
<script setup lang="ts">
import { watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation } from '@embedpdf/vue/annotation';

// Where the two links go on the first page, in page coordinates.
const TO_PAGE_3 = { x: 72, y: 24, width: 160, height: 28 };
const TO_WEBSITE = { x: 250, y: 24, width: 190, height: 28 };

const annotation = useAnnotation();
const pages = usePageList();

let added = false;
watch(
  pages,
  ([first, , third]) => {
    if (!first || !third || added) return;
    added = true;
    const label = (text: string, box: typeof TO_PAGE_3) =>
      annotation.create(first.ref, {
        subtype: 'free-text',
        box,
        contents: text,
        fontSize: 13,
        fontColor: '#054fb3',
        interiorColor: '#e8f1ff',
        color: '#7db6ff',
        strokeWidth: 1,
      });
    void (async () => {
      await label('Go to page 3 →', TO_PAGE_3);
      await label('Open embedpdf.com ↗', TO_WEBSITE);
      await annotation.create(first.ref, {
        subtype: 'link',
        rect: TO_PAGE_3,
        target: { kind: 'goto', destination: { kind: 'fit', page: third.ref } },
      });
      await annotation.create(first.ref, {
        subtype: 'link',
        rect: TO_WEBSITE,
        target: { kind: 'uri', uri: 'https://www.embedpdf.com' },
      });
    })();
  },
  { immediate: true },
);
</script>

<template></template>
