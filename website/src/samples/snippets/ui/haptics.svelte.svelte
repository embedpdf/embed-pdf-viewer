<script lang="ts">
  import { feedbackPlugin, interactionPlugin, vibrationFeedback } from '@embedpdf/svelte/interaction';
  import { Viewer } from '@embedpdf/svelte/runtime';
  import { engine } from './pdf';

  const plugins = [/* … */ interactionPlugin(), feedbackPlugin({ provider: vibrationFeedback })];
</script>

<Viewer {engine} {plugins}>
  <!-- your toolbar and pages -->
</Viewer>
