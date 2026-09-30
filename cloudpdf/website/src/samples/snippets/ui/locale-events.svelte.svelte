<script lang="ts">
  import { useI18nEvent } from '@embedpdf/svelte/i18n';

  useI18nEvent(
    (i18n) => i18n.onLocaleChanged,
    ({ locale }) => document.documentElement.setAttribute('lang', locale),
  );
</script>

<!-- your toolbar and pages -->
