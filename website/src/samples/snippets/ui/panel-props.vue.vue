<script setup lang="ts">
import { useSurface } from '@embedpdf/vue/shell';
import CommentList from './CommentList.vue';

const { props } = useSurface('comments'); // { focus: … }
</script>

<template>
  <CommentList :focus="props.focus" />
</template>
