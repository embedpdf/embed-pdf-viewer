<script setup lang="ts">
import { useSurface } from '@embedpdf/vue/shell';
import CommentList from './CommentList.vue';

const { isOpen, close, toggle } = useSurface('comments');
</script>

<template>
  <button @click="toggle({ exclusive: 'right' })">Comments</button>

  <aside v-if="isOpen">
    <button @click="close()">Close</button>
    <CommentList />
  </aside>
</template>
