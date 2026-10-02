<!-- The toolbar follows the language: in Arabic it runs from right to left. -->
<script lang="ts">
  import { RenderLayer } from '@embedpdf/svelte/render';
  import { Stage } from '@embedpdf/svelte/stage';
  import { useI18n, useI18nState, useT } from '@embedpdf/svelte/i18n';
  import CommandButton from './CommandButton.svelte';

  const i18n = useI18n();
  const t = useT();
  const state = useI18nState();
</script>

<div dir={state.direction} class="root">
  <div class="toolbar">
    <strong class="title">{t('app.title')}</strong>
    <CommandButton id="page:previous" />
    <CommandButton id="page:next" />
    <CommandButton id="zoom:out" />
    <CommandButton id="zoom:in" />
    <button
      type="button"
      class="button switch"
      onclick={() => void i18n.setLocale(state.locale === 'ar' ? 'en' : 'ar')}
    >
      {t('app.switchTo')}
    </button>
  </div>
  <Stage class="stage">
    <RenderLayer />
  </Stage>
</div>
