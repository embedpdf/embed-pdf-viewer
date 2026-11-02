<!-- Every font the document can be written in, grouped by where it comes from. -->
<script lang="ts">
  import { usePageList, type Font, type FontRestriction } from '@embedpdf/svelte/runtime';
  import { useAnnotation } from '@embedpdf/svelte/annotation';
  import { useFontsState } from '@embedpdf/svelte/fonts';

  const GROUPS = [
    ['document', 'In this document'],
    ['engine', 'The engine’s fonts'],
    ['standard', 'Standard'],
  ] as const;

  // Why a font can't be chosen for new text, by its first restriction.
  const WHY: Record<FontRestriction, string> = {
    subset: 'holds only the characters its text uses',
    'not-embedded': 'the file only names it',
    'preview-and-print': 'licensed for viewing and printing only',
    'unsupported-format': 'new text is written in TrueType or OpenType',
    'no-unicode-map': 'doesn’t say which characters it draws',
    'not-served': 'stays on the server',
  };

  const fontsState = useFontsState();
  const annotation = useAnnotation();
  const pages = usePageList();

  const whyOf = (font: Font) =>
    font.canChoose ? null : WHY[font.restrictions[0] ?? 'unsupported-format'];

  // The engine fills Hebrew in from a Hebrew font and puts it in the file: the list reads it.
  async function writeHebrew() {
    const cover = pages.current[0]?.ref;
    if (!cover) return;
    await annotation.create(cover, {
      subtype: 'free-text',
      box: { x: 72, y: 72, width: 220, height: 40 },
      contents: 'שלום עולם',
      fontFamily: 'helvetica',
    });
  }
</script>

<section class="panel">
  <header class="panel-header">
    <h3 class="panel-title">Fonts</h3>
    <button type="button" class="button" onclick={writeHebrew}>Write in Hebrew</button>
    <span class="status" data-status={fontsState.status}>{fontsState.status}</span>
  </header>
  {#each GROUPS as [source, title] (source)}
    {@const group = fontsState.fonts?.fonts.filter((font) => font.source === source) ?? []}
    <div class="group">
      <h4 class="group-title">{title}</h4>
      {#if group.length === 0}
        <p class="empty">None</p>
      {:else}
        <ul class="chips">
          {#each group as font (font.name)}
            {@const why = whyOf(font)}
            <li class="chip" data-choosable={font.canChoose}>
              <span class="chip-name">{font.name}</span>
              {#if why}<span class="chip-why">{why}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/each}
</section>
