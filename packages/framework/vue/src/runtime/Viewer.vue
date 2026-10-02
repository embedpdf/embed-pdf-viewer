<!--
  <Viewer>: owns the kernel. It creates and starts the kernel when it mounts
  (never on the server) and destroys it when it unmounts; the components inside
  read it through composables. `engine`, `plugins` and `initialDocuments` are
  read once; `identity`, `scope`, `accent` and `page` are the viewer's settings
  and follow the props.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, toRaw, watch } from 'vue';
import { createKernel, isLocalEngine, viewerSettingsOf } from '@embedpdf/core';
import type {
  AnyPlugin,
  Engine,
  EngineFactory,
  Identity,
  InitialDocument,
  Kernel,
  ViewerPageSettings,
  ViewerSettings,
} from '@embedpdf/core';
import { devWarn } from '../dev';
import { provideViewer } from './kernel';

const props = defineProps<{
  /**
   * The engine, as an instance or a function. An instance is borrowed: the
   * viewer uses it and never destroys it (a module-level `localEngine()`
   * shared by every viewer). A function is the viewer's own: it calls it when
   * it mounts and destroys the engine when it unmounts. Read once.
   */
  engine: Engine | EngineFactory;
  /** The plugins, created once next to the engine. Read once. */
  plugins: AnyPlugin[];
  /** Documents to open when the viewer starts, with optional tab names. Read once. */
  initialDocuments?: InitialDocument[];
  /**
   * Who the user is, for every document opened without an `identity` of its
   * own (which replaces this one). Documents opened after a change use the new
   * value; open ones keep theirs. The local engine only: the cloud engine reads
   * it from the document's token.
   */
  identity?: Identity;
  /**
   * What the user may do, as permissions, in every document opened without a
   * `scope` of its own. Left out, they may do everything. Changes reach the
   * documents opened after them, as `identity`.
   */
  scope?: readonly string[];
  /** The color every part without a color of its own follows. CSS `--epdf-accent` wins over it. */
  accent?: string;
  /** How pages look: `background` before the picture arrives, and the `shadow` under each page. */
  page?: Partial<ViewerPageSettings>;
}>();

const emit = defineEmits<{
  /**
   * The kernel has started: before the default slot mounts and before
   * `initialDocuments` open. The door for code outside Vue components
   * (register commands, subscribe to events).
   */
  ready: [kernel: Kernel];
}>();

defineSlots<{
  /** The viewer's content, mounted once the kernel has started. */
  default?(): unknown;
  /** Shown while the kernel starts; the composables already work in it. */
  fallback?(): unknown;
  /** Shown when the kernel couldn't be created or started. Without it, a failed start shows nothing. */
  error?(props: { error: unknown }): unknown;
}>();

/**
 * The viewer's settings as the props give them: a prop left out is its
 * default. Values reach the kernel raw: a reactive copy would be another object
 * to it, and can't be sent to a worker.
 */
const settingsOf = (): ViewerSettings =>
  viewerSettingsOf({
    identity: toRaw(props.identity),
    scope: toRaw(props.scope),
    accent: props.accent,
    page: toRaw(props.page),
  });

const kernel = shallowRef<Kernel | null>(null);
const phase = shallowRef<'booting' | 'ready' | 'error'>('booting');
const bootError = shallowRef<unknown>(null);
// Goes up on every kernel change; every reader's computed depends on it.
const revision = shallowRef(0);

provideViewer({
  get kernel() {
    return kernel.value;
  },
  track: () => {
    void revision.value;
  },
});

// Read once: a changed engine or plugin list can't mean "rebuild the
// workspace", which would drop every open document. Raw, because the kernel
// knows a plugin's token by identity, and a reactive copy is another object.
const initial = {
  engine: toRaw(props.engine),
  plugins: toRaw(props.plugins),
  initialDocuments: toRaw(props.initialDocuments),
};
watch(
  () => props.plugins,
  () =>
    devWarn(
      'viewer-plugins-init-only',
      '<Viewer> plugins are read once, when it mounts; a new list is ignored. ' +
        'Create the list once, next to the engine, not inline in the template.',
    ),
);
watch(
  () => props.engine,
  (engine) => {
    // An inline `:engine="() => localEngine()"` is a new function on every
    // render; only another engine instance is worth a warning.
    if (typeof engine === 'function') return;
    devWarn(
      'viewer-engine-init-only',
      '<Viewer> engine is read once, when it mounts; another engine is ignored. ' +
        'To use another engine, mount a new <Viewer>, for example with a new `key`.',
    );
  },
);

let teardown: (() => void) | null = null;

onMounted(() => {
  // A function is the viewer's own engine: called now, destroyed on unmount.
  // An instance is borrowed. Construction is synchronous and inert either way,
  // so warming up a local engine overlaps its boot with the plugins' start.
  const ownsEngine = typeof initial.engine === 'function';
  const engine: Engine = ownsEngine
    ? (initial.engine as EngineFactory)()
    : (initial.engine as Engine);
  if (isLocalEngine(engine)) engine.warmup();
  let created: Kernel;
  try {
    created = createKernel({ engine, plugins: initial.plugins, settings: settingsOf() });
  } catch (error) {
    // A plan or dependency error shows in the `error` slot.
    bootError.value = error;
    phase.value = 'error';
    if (ownsEngine) void engine.destroy();
    return;
  }
  const stopTracking = created.subscribe(() => {
    revision.value += 1;
  });
  // The kernel is on the binding from now on, so the fallback can use it.
  kernel.value = created;
  let alive = true;
  created.start().then(
    () => {
      if (!alive) return;
      emit('ready', created);
      phase.value = 'ready';
      // Every tab appears at once, in order; the `active` entry (else the
      // first) is selected; a failure shows as that document's status.
      created.documents.openAll(initial.initialDocuments ?? []);
    },
    (error: unknown) => {
      if (!alive) return;
      bootError.value = error;
      phase.value = 'error';
    },
  );
  teardown = () => {
    alive = false;
    stopTracking();
    // The kernel first (it closes every document's handle), then the engine
    // the viewer owns.
    void created.destroy().then(() => {
      if (ownsEngine) void engine.destroy();
    });
  };
});

// After the content has unmounted, so its own cleanups still reach a live kernel.
onUnmounted(() => teardown?.());

// Props compare by value: an inline `:page="{ shadow: 'none' }"` is a new
// object on every render, and settings that didn't change change nothing.
watch(settingsOf, (settings) => kernel.value?.updateSettings(settings));

defineExpose({
  /** The started kernel; null before it starts and after a failed start. */
  kernel: computed(() => (phase.value === 'ready' ? kernel.value : null)),
});
</script>

<template>
  <slot v-if="phase === 'error'" name="error" :error="bootError" />
  <template v-else-if="kernel">
    <slot v-if="phase === 'ready'" />
    <slot v-else name="fallback" />
  </template>
</template>
