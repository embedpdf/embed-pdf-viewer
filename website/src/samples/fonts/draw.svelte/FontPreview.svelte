<!-- Type in any font the document can be written in, drawn as the engine will write it. -->
<script lang="ts">
  import { useFontCss, useFontsState } from '@embedpdf/svelte/fonts';

  const fontsState = useFontsState();
  let font = $state('times-roman');
  let text = $state('Hello שלום مرحبا 你好');
  // The font's CSS, its programs mounted while this component lives.
  const css = useFontCss(() => font);
  const choosable = $derived(fontsState.fonts?.fonts.filter((entry) => entry.canChoose) ?? []);
</script>

<section class="panel">
  <label class="field">
    Font
    <select bind:value={font}>
      {#each choosable as entry (entry.name)}
        <option value={entry.name}>{entry.name}</option>
      {/each}
    </select>
  </label>
  <textarea
    class="preview"
    style:font-family={css.current?.fontFamily}
    style:font-weight={css.current?.fontWeight}
    style:font-style={css.current?.fontStyle}
    style:font-synthesis="none"
    bind:value={text}
  ></textarea>
  <p class="hint">Characters no font has show as boxes, as the engine writes them.</p>
</section>
