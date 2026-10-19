<script setup lang="ts">
// The publish check's canary: each line marked "error expected" must be an error, proof that
// the published types aren't `any`.
import { useSearch, useSearchState, notASearchExport } from '@embedpdf/vue/search'; // error expected
import { useForm } from '@embedpdf/vue/form';
import { Stage } from '@embedpdf/vue/stage';

const search = useSearch();
search.notASearchMethod(); // error expected
const { hitCount } = useSearchState();
const wrong: string = hitCount.value; // error expected
useForm().notAFormMethod(); // error expected
void [notASearchExport, wrong];
</script>

<template><Stage :not-a-stage-prop="1" /><!-- error expected --></template>
