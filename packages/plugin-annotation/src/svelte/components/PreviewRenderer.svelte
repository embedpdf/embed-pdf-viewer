<script lang="ts">
  import type { PreviewState } from '@embedpdf/plugin-annotation';
  import { getRendererRegistry } from '../context/renderer-registry.svelte';
  import { builtInRenderers } from './built-in-renderers';

  interface PreviewRendererProps {
    toolId: string;
    preview: PreviewState;
    scale: number;
  }

  let { toolId, preview, scale }: PreviewRendererProps = $props();

  const registry = getRendererRegistry();

  const bounds = $derived(preview.bounds);

  const style = $derived({
    left: bounds.origin.x * scale,
    top: bounds.origin.y * scale,
    width: bounds.size.width * scale,
    height: bounds.size.height * scale,
  });

  const allRenderers = $derived.by(() => {
    const external = registry?.getAll() ?? [];
    const externalIds = new Set(external.map((r) => r.id));
    return [...external, ...builtInRenderers.filter((r) => !externalIds.has(r.id))];
  });

  const match = $derived(
    allRenderers.find((r) => r.matchesPreview?.(preview) && r.renderPreview) ??
      allRenderers.find((r) => r.id === toolId && r.renderPreview) ??
      null,
  );

  const extraStyle = $derived(
    match?.previewContainerStyle?.({ data: preview.data, bounds: preview.bounds, scale }) ?? '',
  );
</script>

{#if match?.renderPreview}
  {@const PreviewComponent = match.renderPreview}
  <div
    style="position:absolute;left:{style.left}px;top:{style.top}px;width:{style.width}px;height:{style.height}px;pointer-events:none;z-index:10;{extraStyle}"
  >
    <PreviewComponent data={preview.data} bounds={preview.bounds} {scale} />
  </div>
{/if}
