<script lang="ts">
  import { type Component, type Snippet } from 'svelte';
  import NestedWrapper from './NestedWrapper.svelte';

  interface Props {
    wrappers: Component[];
    utilities?: Component[];
    children?: Snippet;
  }

  let { wrappers, utilities = [], children }: Props = $props();
</script>

{#if wrappers.length > 1}
  {@const Wrapper = wrappers[0]}
  <Wrapper>
    <NestedWrapper wrappers={wrappers.slice(1)} {utilities}>
      {@render children?.()}
    </NestedWrapper>
  </Wrapper>
{:else}
  {@const Wrapper = wrappers[0]}
  <Wrapper>
    {@render children?.()}
    <!-- Render utilities inside the innermost wrapper -->
    {#each utilities as Utility, i (`utility-${i}`)}
      <Utility />
    {/each}
  </Wrapper>
{/if}
