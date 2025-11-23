<script lang="ts">
  import { iconRegistry, type IconName, type IconProps } from './icons/registry';

  interface Props extends IconProps {
    name: string;
    /**
     * Maps to CSS 'color' -> SVG 'currentColor' (stroke)
     */
    primaryColor?: string;
    /**
     * Maps to CSS 'fill'
     */
    secondaryColor?: string;

    class?: string;
  }

  // We capture the specific color props here so they don't leak into ...rest
  let { name, primaryColor, secondaryColor, style, ...rest }: Props = $props();

  const IconComponent = $derived(iconRegistry[name as IconName]);

  // We inject the colors as native CSS styles.
  // This is cleaner than modifying 50+ icon files to accept new props.
  const mergedStyle = $derived.by(() => {
    let s = style || '';
    // Use semicolon to ensure we don't break existing style strings
    if (primaryColor) s += `; color: ${primaryColor}`;
    if (secondaryColor) s += `; fill: ${secondaryColor}`;
    return s;
  });
</script>

{#if IconComponent}
  <IconComponent {...rest} style={mergedStyle} />
{:else}
  <span class="text-xs text-red-500" title={`Icon '${name}' not found`}>?</span>
{/if}
