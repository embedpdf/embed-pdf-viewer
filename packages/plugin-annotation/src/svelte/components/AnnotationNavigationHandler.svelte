<script lang="ts">
  import { useAnnotationPlugin, useAnnotationCapability } from '../hooks';

  const { plugin } = useAnnotationPlugin();
  const { provides } = useAnnotationCapability();

  $effect(() => {
    const p = provides;
    const pl = plugin;
    if (!p || !pl) return;

    return p.onNavigate((event) => {
      if (event.result.outcome === 'uri' && pl.config.autoOpenLinks !== false) {
        window.open(event.result.uri, '_blank', 'noopener,noreferrer');
      }
    });
  });
</script>
