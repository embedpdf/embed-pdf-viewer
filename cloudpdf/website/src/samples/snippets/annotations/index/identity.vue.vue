<script setup lang="ts">
import { Viewer } from '@embedpdf/vue/runtime';

import { contract, engine, plugins } from './setup';
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :identity="{ userId: 'u_381', displayName: 'Dana Smith' }"
    :initial-documents="[{ source: contract }]"
  />
</template>
