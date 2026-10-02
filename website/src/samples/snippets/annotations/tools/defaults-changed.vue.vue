<script setup lang="ts">
import { useAnnotationEvent } from '@embedpdf/vue/annotation';

import { saveStyle } from './styles';

useAnnotationEvent(
  (annotation) => annotation.tools.onDefaultsChanged,
  ({ toolId, defaults }) => saveStyle(toolId, defaults),
);
</script>
