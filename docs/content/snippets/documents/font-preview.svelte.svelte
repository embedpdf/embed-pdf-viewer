<script lang="ts">
  import { useFontCss } from '@embedpdf/svelte/fonts';

  let { font }: { font: string } = $props();
  // Its programs are mounted while this component lives.
  const css = useFontCss(() => font);
</script>

<input
  value="Hello שלום"
  style:font-family={css.current?.fontFamily}
  style:font-weight={css.current?.fontWeight}
  style:font-style={css.current?.fontStyle}
  style:font-synthesis="none"
/>
