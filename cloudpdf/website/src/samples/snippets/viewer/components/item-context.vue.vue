<script setup lang="ts">
import { useToolbarItem } from '@embedpdf/viewer-vue';

defineProps<{ people: { id: string; name: string; avatar: string }[] }>();
const item = useToolbarItem(); // item.orientation is 'horizontal' or 'vertical'
</script>

<template>
  <div :class="['reviewers', item.orientation]">
    <img v-for="person in people" :key="person.id" :src="person.avatar" :alt="person.name" :title="person.name" />
  </div>
</template>
