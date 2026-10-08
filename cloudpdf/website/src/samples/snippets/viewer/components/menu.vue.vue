<script setup lang="ts">
import { Menu, MenuItem } from '@embedpdf/viewer-vue';
import { copyLink, emailLink } from './share'; // your app
</script>

<template>
  <Menu icon="link" label="Share">
    <MenuItem icon="copy" @select="copyLink">Copy link</MenuItem>
    <MenuItem icon="message" @select="emailLink">Email a link</MenuItem>
  </Menu>
</template>
