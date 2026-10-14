<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';
import { archive, engine, plugins, report } from './pdf';

const identity = { userId: 'u_381', displayName: 'Dana Smith' };
const scope = [
  'doc.open',
  'doc.render',
  'doc.text.select',
  'doc.annotate.read',
  'annotations:create:self',
  'annotations:update:self',
  'annotations:delete:self',
];
const initialDocuments = [
  { source: report },
  { source: archive, scope: ['doc.open', 'doc.render'] }, // this one is read-only
];
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :identity="identity"
    :scope="scope"
    :initial-documents="initialDocuments"
  />
</template>
