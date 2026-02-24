<script lang="ts">
  import { usePanCapability, usePanPlugin } from '../hooks';

  const { provides: pan } = usePanCapability();
  const { plugin: panPlugin } = usePanPlugin();

  $effect(() => {
    if (!pan || !panPlugin) return;

    const mode = panPlugin.config?.defaultMode ?? 'never';
    const SUPPORT_TOUCH =
      typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    if (mode === 'mobile' && SUPPORT_TOUCH) {
      pan.makePanDefault();
    }
  });
</script>

<!-- This component is only used to make the pan mode default when the plugin is initialized. -->
