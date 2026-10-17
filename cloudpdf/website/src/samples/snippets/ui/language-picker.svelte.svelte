<script lang="ts">
  import { useI18n, useI18nState } from '@embedpdf/svelte/i18n';

  const i18n = useI18n();
  const state = useI18nState();
</script>

<select
  value={state.locale}
  disabled={state.loading !== null}
  onchange={(event) => i18n.setLocale(event.currentTarget.value)}
>
  {#each state.locales as language (language.code)}
    <option value={language.code}>{language.name}</option>
  {/each}
</select>
