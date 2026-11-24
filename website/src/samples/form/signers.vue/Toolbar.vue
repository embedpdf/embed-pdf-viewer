<script setup lang="ts">
import { useForm } from '@embedpdf/vue/form';
import { signers, type Person } from './people';
import SenderToolbar from './SenderToolbar.vue';
import SignerLegend from './SignerLegend.vue';

defineProps<{ person: Person }>();

// The open document says what its user may do: it is the sender's while they may design it.
const form = useForm();

// Tell the open document who its groups are.
form.setGroups(signers);
</script>

<template>
  <SenderToolbar v-if="form.canDesign()" />
  <SignerLegend v-else :person="person" />
</template>
