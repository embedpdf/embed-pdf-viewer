<script lang="ts">
  import { useFontsState } from '@embedpdf/svelte/fonts';

  let { value = $bindable() }: { value: string } = $props();
  const fontsState = useFontsState();
  const choosable = $derived(fontsState.fonts?.fonts.filter((font) => font.canChoose) ?? []);
</script>

<select bind:value>
  {#each choosable as font (font.name)}
    <option value={font.name}>{font.name}</option>
  {/each}
</select>
