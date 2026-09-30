<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import { engine, plugins } from './pdf';

const identity = { userId: 'u_381', displayName: 'Dana Smith' };
const scope = ['doc.open', 'doc.render', 'doc.text.select', 'doc.annotate.read', 'annotations:create:self'];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :identity="identity" :scope="scope" />
</template>
