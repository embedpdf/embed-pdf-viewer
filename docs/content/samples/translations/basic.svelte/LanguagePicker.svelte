<script lang="ts">
  import { useI18n, useI18nState, useT } from '@embedpdf/svelte/i18n';

  const i18n = useI18n();
  const t = useT();
  const state = useI18nState();
</script>

<label class="picker">
  {t('app.language')}
  <select
    class="select"
    value={state.locale}
    disabled={state.loading !== null}
    onchange={(event) => void i18n.setLocale(event.currentTarget.value)}
  >
    {#each state.locales as language (language.code)}
      <option value={language.code}>{language.name}</option>
    {/each}
  </select>
</label>
