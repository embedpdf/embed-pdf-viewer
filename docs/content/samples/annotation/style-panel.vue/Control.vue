<script setup lang="ts">
import { computed } from 'vue';
import { useAnnotation, useAnnotationProperties } from '@embedpdf/vue/annotation';
import type { AnnotationProperty, LineEnding } from '@embedpdf/vue/annotation';

// One control per property, by the control it asks for.
const props = defineProps<{ property: AnnotationProperty }>();

const annotation = useAnnotation();
const panel = useAnnotationProperties();
const value = computed(() => panel.value.values[props.property.key]);
const isMixed = computed(() => panel.value.mixed.includes(props.property.key));

const update = (next: unknown) => annotation.selection.update({ [props.property.key]: next });
/** What the control holds now, from its `input` or `change` event. */
const valueOf = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;

// Line endings are a pair: this sets the end, and each line keeps its own start.
const lineEnd = computed(() => (value.value as { end?: string } | undefined)?.end ?? 'none');
function setLineEnd(event: Event) {
  const next = valueOf(event) as LineEnding;
  void annotation.selection.update((member) =>
    member.subtype === 'line' ? { lineEndings: { ...member.lineEndings, end: next } } : {},
  );
}

// The border is three fields: its style, its dashes, and how cloudy it is.
const border = computed(() =>
  panel.value.values.cloudyIntensity ? 'cloudy' : String(value.value),
);
function setBorder(event: Event) {
  const next = valueOf(event);
  void annotation.selection.update({
    borderStyle: next === 'dashed' ? 'dashed' : 'solid',
    dashArray: next === 'dashed' ? [4, 3] : null,
    cloudyIntensity: next === 'cloudy' ? 1 : null,
  });
}

function setLink(event: Event) {
  void annotation.selection.updateLink(
    valueOf(event) === 'website' ? { kind: 'uri', uri: 'https://www.embedpdf.com' } : null,
  );
}
</script>

<template>
  <span v-if="property.control === 'color'" class="pair">
    <input
      type="color"
      class="color"
      :aria-label="property.label"
      :value="typeof value === 'string' ? value : '#ffffff'"
      @input="update(valueOf($event))"
    />
    <button
      v-if="property.key === 'interiorColor'"
      type="button"
      class="link"
      @click="update(null)"
    >
      {{ value === null ? 'none' : 'remove' }}
    </button>
  </span>
  <span v-else-if="property.control === 'number'" class="pair">
    <input
      type="range"
      :aria-label="property.label"
      :min="property.min"
      :max="property.max"
      :step="property.step"
      :value="typeof value === 'number' ? value : property.min"
      @input="update(Number(valueOf($event)))"
    />
    <output class="value">{{ isMixed ? 'mixed' : String(value) }}</output>
  </span>
  <select
    v-else-if="property.control === 'choice' && property.key === 'lineEndings'"
    class="select"
    aria-label="Line end"
    :value="lineEnd"
    @change="setLineEnd"
  >
    <option v-for="option in property.options" :key="option">{{ option }}</option>
  </select>
  <select
    v-else-if="property.control === 'choice' && property.key === 'borderStyle'"
    class="select"
    :aria-label="property.label"
    :value="isMixed ? '' : border"
    @change="setBorder"
  >
    <option v-if="isMixed" value="">mixed</option>
    <option v-for="option in property.options" :key="option">{{ option }}</option>
  </select>
  <select
    v-else-if="property.control === 'choice'"
    class="select"
    :aria-label="property.label"
    :value="isMixed ? '' : String(value ?? '')"
    @change="update(valueOf($event))"
  >
    <option v-if="isMixed" value="">mixed</option>
    <option v-for="option in property.options" :key="option">{{ option }}</option>
  </select>
  <input
    v-else-if="property.control === 'flag'"
    type="checkbox"
    :aria-label="property.label"
    :checked="value === true"
    @change="update(($event.target as HTMLInputElement).checked)"
  />
  <button
    v-else-if="property.control === 'textFormat'"
    type="button"
    class="toggle"
    :aria-pressed="value === true"
    @click="annotation.text.toggleFormat(property.format)"
  >
    {{ property.label }}
  </button>
  <input
    v-else-if="property.control === 'text'"
    class="text"
    :aria-label="property.label"
    :value="typeof value === 'string' ? value : ''"
    @input="update(valueOf($event))"
  />
  <select
    v-else-if="property.control === 'link'"
    class="select"
    :aria-label="property.label"
    :value="value ? 'website' : 'none'"
    @change="setLink"
  >
    <option value="none">No link</option>
    <option value="website">embedpdf.com</option>
  </select>
</template>
