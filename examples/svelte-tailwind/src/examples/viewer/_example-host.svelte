<script lang="ts">
  /**
   * Generic host wrapper for docs website embeds.
   *
   * - Watches `<html class="dark">` (Tailwind dark mode) and derives `themePreference`
   * - Renders an arbitrary Svelte component via `<svelte:component>`
   * - Passes `themePreference` down as a prop (extra props are generally safe to ignore)
   */
  import { onMount } from 'svelte';

  type AnySvelteComponent = any;

  interface Props {
    Component: AnySvelteComponent;
    componentProps?: Record<string, unknown>;
  }

  let { Component, componentProps = {} }: Props = $props();

  let themePreference = $state<'light' | 'dark'>('light');

  onMount(() => {
    const html = document.documentElement;

    const updateTheme = () => {
      themePreference = html.classList.contains('dark') ? 'dark' : 'light';
    };

    updateTheme();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          updateTheme();
        }
      }
    });

    observer.observe(html, { attributes: true });

    return () => observer.disconnect();
  });
</script>

<svelte:component this={Component} {...componentProps} {themePreference} />
