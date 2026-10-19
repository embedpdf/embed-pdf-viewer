<script lang="ts">
  import { useI18nState } from '@embedpdf/svelte/i18n';

  const state = useI18nState();
</script>

<div dir={state.direction}>
  <!-- your viewer -->
</div>
