<!--
  One link's clickable area: a real <a>, on purpose. A website gets an `href`,
  so middle-click, "copy link", the status-bar preview and keyboard focus come
  for free. A click or a key follows the link through the plugin's
  `activate()`, so every way of following one fires `onActivated`. With the
  actions plugin, the link's own PDF events (enter, exit, down, up, focus,
  blur) go to it from here: these anchors are the link's pixels.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { Link } from '@embedpdf/plugin-link';
import {
  hoverLink,
  isModifiedClick,
  linkActivateContextOf,
  linkAnchorOf,
  sendLinkEvent,
  type LinkAnchorEvent,
} from '@embedpdf/web';
import { usePage } from '../runtime/page';
import type { LinkLayerContext } from './composables';

const props = defineProps<{
  item: Link;
  layer: LinkLayerContext;
}>();

const page = usePage();

// Its box, its label, and a native `href` only for a website with nothing chained after it.
const anchor = computed(() =>
  linkAnchorOf(props.item, page.value.transform, (item) => props.layer.link.getLabel(item)),
);
const box = computed(() => anchor.value.box);
const href = computed(() => anchor.value.href);
const label = computed(() => anchor.value.label);

const follow = () =>
  props.layer.link.activate(
    props.item,
    linkActivateContextOf(props.item, page.value.ref, props.layer.stage),
  );

function onClick(event: MouseEvent): void {
  // A modified click on a real href keeps the browser's own behavior (a
  // background tab, a new window).
  if (href.value && isModifiedClick(event)) return;
  // Every other click follows the link through the plugin, which opens a
  // website through this binding's opener.
  event.preventDefault();
  follow();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  follow();
}

/** The link's own PDF event, through the actions plugin: only a link that is an annotation has one. */
const notify = (event: LinkAnchorEvent): void =>
  sendLinkEvent(props.layer.actions, props.item, page.value.ref, event);

const onEnter = (): void => hoverLink(props.layer.pump, props.item, page.value.ref);
</script>

<template>
  <!--
    A press on a link must not reach the Stage (it would start the active
    tool's gesture, or end an edit as a click outside): Vue's listener is native
    and on the anchor itself, so `.stop` keeps it here, and it sends the link's
    "mouse down" event.
  -->
  <a
    :href="href ?? undefined"
    target="_blank"
    rel="noopener noreferrer"
    role="link"
    tabindex="0"
    :title="label"
    :aria-label="label"
    :style="{
      position: 'absolute',
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      cursor: 'pointer',
      pointerEvents: 'auto',
    }"
    @click="onClick"
    @keydown="onKeydown"
    @pointerdown.stop="notify('mouseDown')"
    @pointerup="notify('mouseUp')"
    @pointerenter="onEnter"
    @pointerleave="layer.pump?.hover(null)"
    @focus="notify('focus')"
    @blur="notify('blur')"
  />
</template>
