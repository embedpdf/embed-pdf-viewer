<script lang="ts">
  import { type Component, type Snippet } from 'svelte';
  import NestedWrapper from './NestedWrapper.svelte';

  interface Props {
    wrappers: Component[];
    children?: Snippet;
  }

  let { wrappers, children }: Props = $props();
</script>

{#if wrappers.length > 1}
  {@const Wrapper = wrappers[0]}
  <Wrapper>
    <NestedWrapper wrappers={wrappers.slice(1)}>
      {@render children?.()}
    </NestedWrapper>
  </Wrapper>
{:else}
  {@const Wrapper = wrappers[0]}
  <Wrapper>
    {@render children?.()}
  </Wrapper>
{/if}
