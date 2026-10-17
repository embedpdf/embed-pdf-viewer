<script lang="ts">
  import { useStageState } from '@embedpdf/svelte/stage';
  import { useT } from '@embedpdf/svelte/i18n';

  const t = useT();
  const stageState = useStageState();
</script>

<output class="count">{t('app.pages', { params: { count: stageState.pageCount } })}</output>
