<script lang="ts">
  import { useTranslation } from '../hooks/use-i18n.svelte';

  interface TranslateProps {
    k: string;
    params?: Record<string, string | number>;
    fallback?: string;
    documentId?: string;
  }

  let { k, params, fallback, documentId }: TranslateProps = $props();

  const translation = useTranslation(
    () => k,
    () => ({ params, fallback }),
    () => documentId,
  );
</script>

{translation.current}
