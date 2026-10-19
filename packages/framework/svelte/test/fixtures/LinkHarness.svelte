<!--
  A page with a `<LinkLayer>`, inside an element that listens for presses natively, as the Stage
  does; `custom` draws each link with the layer's `link` snippet around its own anchor.
-->
<script lang="ts">
  import { LinkLayer } from '../../src/link';
  import { setPageContext } from '../../src/runtime';
  import { pageContext } from './page-context';

  let { custom = false, stagePresses = [] }: { custom?: boolean; stagePresses?: Event[] } =
    $props();

  setPageContext(pageContext(1, 0));

  function stageBelow(element: HTMLElement) {
    const record = (event: Event) => stagePresses.push(event);
    element.addEventListener('pointerdown', record);
    return () => element.removeEventListener('pointerdown', record);
  }
</script>

<div {@attach stageBelow}>
  {#if custom}
    <LinkLayer>
      {#snippet link({ link, native })}
        <span data-testid="link-{link.id}" data-kind={link.target.kind}>{@render native()}</span>
      {/snippet}
    </LinkLayer>
  {:else}
    <LinkLayer />
  {/if}
</div>
