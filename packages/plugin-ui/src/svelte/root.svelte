<script lang="ts">
  import { UI_ATTRIBUTES, UI_SELECTORS } from '@embedpdf/plugin-ui';
  import { useUIPlugin, useUICapability } from './hooks/use-ui.svelte';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  type Props = HTMLAttributes<HTMLDivElement> & {
    children?: Snippet;
  };

  let { children, class: className, ...restProps }: Props = $props();

  const { plugin } = useUIPlugin();
  const { provides } = useUICapability();

  let disabledCategories = $state<string[]>([]);
  let rootElement: HTMLDivElement | null = $state(null);
  let styleEl: HTMLStyleElement | null = null;
  let styleTarget: HTMLElement | ShadowRoot | null = null;

  function getStyleTarget(element: HTMLElement): HTMLElement | ShadowRoot {
    const root = element.getRootNode();
    if (root instanceof ShadowRoot) {
      return root;
    }
    return document.head;
  }

  $effect(() => {
    if (!rootElement || !plugin) {
      styleTarget = null;
      return;
    }

    styleTarget = getStyleTarget(rootElement);

    const existingStyle = styleTarget.querySelector(UI_SELECTORS.STYLES) as HTMLStyleElement | null;

    if (existingStyle) {
      styleEl = existingStyle;
      existingStyle.textContent = plugin.getStylesheet();
      return;
    }

    const stylesheet = plugin.getStylesheet();
    const newStyleEl = document.createElement('style');
    newStyleEl.setAttribute(UI_ATTRIBUTES.STYLES, '');
    newStyleEl.textContent = stylesheet;

    if (styleTarget instanceof ShadowRoot) {
      styleTarget.insertBefore(newStyleEl, styleTarget.firstChild);
    } else {
      styleTarget.appendChild(newStyleEl);
    }

    styleEl = newStyleEl;

    return () => {
      if (styleEl?.parentNode) {
        styleEl.remove();
      }
      styleEl = null;
      styleTarget = null;
    };
  });

  $effect(() => {
    if (!plugin) return;

    return plugin.onStylesheetInvalidated(() => {
      if (styleEl) {
        styleEl.textContent = plugin.getStylesheet();
      }
    });
  });

  $effect(() => {
    if (!provides) return;

    disabledCategories = provides.getDisabledCategories();

    return provides.onCategoryChanged((event) => {
      disabledCategories = event.disabledCategories;
    });
  });

  const disabledCategoriesAttr = $derived(
    disabledCategories.length > 0 ? disabledCategories.join(' ') : undefined,
  );
</script>

<div
  bind:this={rootElement}
  {...restProps}
  {...{ [UI_ATTRIBUTES.ROOT]: '' }}
  {...disabledCategoriesAttr ? { [UI_ATTRIBUTES.DISABLED_CATEGORIES]: disabledCategoriesAttr } : {}}
  class={className}
  style:container-type="inline-size"
>
  {#if children}
    {@render children()}
  {/if}
</div>
