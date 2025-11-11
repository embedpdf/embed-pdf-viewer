<script lang="ts">
  import { useTranslation } from '../hooks/use-i18n.svelte';

  interface TranslateProps {
    k: string;
    params?: Record<string, string | number>;
  }

  let { k, params }: TranslateProps = $props();

  const translation = useTranslation(
    () => k,
    () => params,
  );
</script>

{translation.current}
