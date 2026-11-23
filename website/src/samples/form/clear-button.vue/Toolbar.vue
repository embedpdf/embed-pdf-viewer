<script setup lang="ts">
import { useForm } from '@embedpdf/vue/form';
import { useStage } from '@embedpdf/vue/stage';

const form = useForm();
const stage = useStage();

const fillIn = () =>
  form.importValues({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    company: 'Lanternfield',
  });
</script>

<template>
  <div class="toolbar">
    <button type="button" class="button" @click="fillIn">Fill in</button>
    <button type="button" class="button" @click="stage.zoomIn()">Zoom in</button>
    <button type="button" class="button" @click="stage.rotateViewBy(90)">Turn the view</button>
  </div>
</template>
