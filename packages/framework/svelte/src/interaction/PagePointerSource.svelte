<!--
  The one pointer listener per page: it turns pointer events into page points through the page
  context and hands them to the interaction plugin. It binds only to the page context, so it
  works the same on a Stage page and on a `<PageView>`. Features never listen to the pointer
  themselves: they register handlers with the interaction plugin, and a tool of your own brings
  its pointer methods (`registerTool`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
  import { attachPagePointer } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import { useOptionalCapability, useOptionalSelector } from '../runtime/readers.svelte';

  const page = usePage();
  // The pointer source is a host of the interaction plugin: it dispatches samples.
  const interaction = useOptionalCapability(InteractionToken);
  const cursor = useOptionalSelector(InteractionToken, (hub) => hub.getCursor(), 'default');

  let element: HTMLDivElement | undefined;

  // The listener is `@embedpdf/web`'s, shared with every framework. It reads the page when an
  // event arrives: a zoom changes it, and a drag carries on through it.
  $effect(() => {
    const hub = interaction.current;
    const target = element;
    if (!hub || !target) return;
    return untrack(() => attachPagePointer(target, hub, () => page));
  });
</script>

<!-- On top, as the page's event surface; the drawing layers below take no pointer events. -->
<div
  bind:this={element}
  style="position: absolute; inset: 0; touch-action: none"
  style:cursor={cursor.current}
></div>
