<!--
  Follows the pointer while a selection is being turned, upright however the page is shown: it
  floats over the page like the menus, not in it. Shows nothing when no turn is in progress.
  Without a `children` snippet it shows the angle in the `chrome.readout` colors, when
  `chrome.readout.enabled`.
-->
<script lang="ts">
  import { AnnotationToken } from '@embedpdf/plugin-annotation';
  import { paint, paintDefault, sameRotationAnchor } from '@embedpdf/web';
  import Anchored from '../anchored/Anchored.svelte';
  import { useOptionalSelector } from '../runtime/readers.svelte';
  import type { AnnotationRotationBadgeProps } from './props';
  import { useAnnotationSettings } from './state';

  let { children, gap = 16, placement = 'right' }: AnnotationRotationBadgeProps = $props();

  const rotation = useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.selection.getRotationAnchor(),
    null,
    sameRotationAnchor,
  );
  const readout = useAnnotationSettings((settings) => settings.chrome.readout);
</script>

{#if rotation.current && (children || readout.current.enabled)}
  <Anchored
    anchor={{
      page: rotation.current.page,
      bounds: { ...rotation.current.at, width: 0, height: 0 },
    }}
    {placement}
    {gap}
  >
    {#if children}
      {@render children(rotation.current)}
    {:else}
      <div
        style:pointer-events="none"
        style:white-space="nowrap"
        style:border-radius="4px"
        style:padding="2px 6px"
        style:font-family={paintDefault('font-mono')}
        style:font-size="12px"
        style:background={paint('readout-background', readout.current.background)}
        style:color={paint('readout-color', readout.current.color)}
      >
        {rotation.current.angle}°
      </div>
    {/if}
  </Anchored>
{/if}
