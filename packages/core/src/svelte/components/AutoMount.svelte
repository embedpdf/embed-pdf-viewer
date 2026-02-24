<script lang="ts">
  import { hasAutoMountElements, type PluginBatchRegistration, type IPlugin } from '@embedpdf/core';
  import NestedWrapper from './NestedWrapper.svelte';
  import type { Snippet } from 'svelte';

  type Props = {
    plugins: PluginBatchRegistration<IPlugin<any>, any>[];
    children: Snippet;
  };

  let { plugins, children }: Props = $props();
  let utilities: any[] = $state([]);
  let wrappers: any[] = $state([]);

  // recompute when plugins change
  $effect(() => {
    const nextUtilities: any[] = [];
    const nextWrappers: any[] = [];

    for (const reg of plugins) {
      const pkg = reg.package;
      if (hasAutoMountElements(pkg)) {
        const elements = pkg.autoMountElements?.() ?? [];
        for (const element of elements) {
          if (element.type === 'utility') {
            nextUtilities.push(element.component);
          } else if (element.type === 'wrapper') {
            nextWrappers.push(element.component);
          }
        }
      }
    }

    utilities = nextUtilities;
    wrappers = nextWrappers;
  });
</script>

{#if wrappers.length > 0}
  <!-- wrap slot content and utilities inside all wrappers -->
  <NestedWrapper {wrappers} {utilities} {children} />
{:else}
  <!-- No wrappers - render children and utilities directly -->
  {@render children?.()}
  {#each utilities as Utility, i (`utility-${i}`)}
    <Utility />
  {/each}
{/if}
