<script setup lang="ts">
import { useAnnotationEvent } from '@embedpdf/vue/annotation';

import { toast } from './toast';

useAnnotationEvent(
  (annotation) => annotation.onWriteFailed,
  ({ error }) => toast(`Couldn't save: ${error.message}`),
);
</script>
