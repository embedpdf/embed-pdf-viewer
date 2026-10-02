<!-- One control per property, by the control it asks for. -->
<script lang="ts">
  import {
    useAnnotation,
    useAnnotationProperties,
    type AnnotationProperty,
    type LineEnding,
  } from '@embedpdf/svelte/annotation';

  let { property }: { property: AnnotationProperty } = $props();

  const annotation = useAnnotation();
  const panel = useAnnotationProperties();
  const value = $derived(panel.current.values[property.key]);
  const isMixed = $derived(panel.current.mixed.includes(property.key));
  const update = (next: unknown) => annotation.selection.update({ [property.key]: next });

  // Line endings are a pair: this sets the end, and each line keeps its own start.
  function updateEnd(next: LineEnding) {
    void annotation.selection.update((member) =>
      member.subtype === 'line' ? { lineEndings: { ...member.lineEndings, end: next } } : {},
    );
  }

  // The border is three fields: its style, its dashes, and how cloudy it is.
  function updateBorder(next: string) {
    void annotation.selection.update({
      borderStyle: next === 'dashed' ? 'dashed' : 'solid',
      dashArray: next === 'dashed' ? [4, 3] : null,
      cloudyIntensity: next === 'cloudy' ? 1 : null,
    });
  }
</script>

{#if property.control === 'color'}
  <span class="pair">
    <input
      type="color"
      class="color"
      aria-label={property.label}
      value={typeof value === 'string' ? value : '#ffffff'}
      oninput={(event) => update(event.currentTarget.value)}
    />
    {#if property.key === 'interiorColor'}
      <button type="button" class="link" onclick={() => update(null)}>
        {value === null ? 'none' : 'remove'}
      </button>
    {/if}
  </span>
{:else if property.control === 'number'}
  <span class="pair">
    <input
      type="range"
      aria-label={property.label}
      min={property.min}
      max={property.max}
      step={property.step}
      value={typeof value === 'number' ? value : property.min}
      oninput={(event) => update(Number(event.currentTarget.value))}
    />
    <output class="value">{isMixed ? 'mixed' : String(value)}</output>
  </span>
{:else if property.control === 'choice' && property.key === 'lineEndings'}
  <select
    class="select"
    aria-label="Line end"
    value={(value as { end?: string } | undefined)?.end ?? 'none'}
    onchange={(event) => updateEnd(event.currentTarget.value as LineEnding)}
  >
    {#each property.options as option (option)}
      <option>{option}</option>
    {/each}
  </select>
{:else if property.control === 'choice' && property.key === 'borderStyle'}
  <select
    class="select"
    aria-label={property.label}
    value={isMixed ? '' : panel.current.values.cloudyIntensity ? 'cloudy' : String(value)}
    onchange={(event) => updateBorder(event.currentTarget.value)}
  >
    {#if isMixed}
      <option value="">mixed</option>
    {/if}
    {#each property.options as option (option)}
      <option>{option}</option>
    {/each}
  </select>
{:else if property.control === 'choice'}
  <select
    class="select"
    aria-label={property.label}
    value={isMixed ? '' : String(value ?? '')}
    onchange={(event) => update(event.currentTarget.value)}
  >
    {#if isMixed}
      <option value="">mixed</option>
    {/if}
    {#each property.options as option (option)}
      <option>{option}</option>
    {/each}
  </select>
{:else if property.control === 'flag'}
  <input
    type="checkbox"
    aria-label={property.label}
    checked={value === true}
    onchange={(event) => update(event.currentTarget.checked)}
  />
{:else if property.control === 'textFormat'}
  {@const format = property.format}
  <button
    type="button"
    class="toggle"
    aria-pressed={value === true}
    onclick={() => annotation.text.toggleFormat(format)}
  >
    {property.label}
  </button>
{:else if property.control === 'text'}
  <input
    class="text"
    aria-label={property.label}
    value={typeof value === 'string' ? value : ''}
    oninput={(event) => update(event.currentTarget.value)}
  />
{:else if property.control === 'link'}
  <select
    class="select"
    aria-label={property.label}
    value={value ? 'website' : 'none'}
    onchange={(event) =>
      annotation.selection.updateLink(
        event.currentTarget.value === 'website'
          ? { kind: 'uri', uri: 'https://www.embedpdf.com' }
          : null,
      )}
  >
    <option value="none">No link</option>
    <option value="website">embedpdf.com</option>
  </select>
{/if}
