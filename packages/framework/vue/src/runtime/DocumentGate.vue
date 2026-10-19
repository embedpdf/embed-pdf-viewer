<!--
  <DocumentGate>: renders its content only while this subtree has a ready
  document, the structural way to say "this UI is defined over a document".
  Workspace UI (toolbars, commands) lives outside it; document UI (the Stage,
  panels) inside. A document that waits for its password, or failed, renders
  the `#locked` or `#error` slot with it, or else `#fallback`. It decides
  whether; <DocumentScope> decides which document.
-->
<script setup lang="ts">
import type { DocumentInfo, FailedDocumentInfo, LockedDocumentInfo } from '@embedpdf/core';
import { useDocument } from './documents';

defineSlots<{
  /** Rendered while the document is ready. */
  default?(): unknown;
  /** Shown while this subtree has no document: none is open, or it's still opening. */
  fallback?(): unknown;
  /** Shown while the document waits for its password; `#fallback` without it. */
  locked?(props: { document: LockedDocumentInfo }): unknown;
  /** Shown when the document couldn't be opened, with why; `#fallback` without it. */
  error?(props: { document: FailedDocumentInfo }): unknown;
}>();

const current = useDocument((document: DocumentInfo) => document);
</script>

<template>
  <slot v-if="current.status === 'ready'" />
  <slot
    v-else-if="current.status === 'locked' && $slots.locked"
    name="locked"
    :document="current as LockedDocumentInfo"
  />
  <slot
    v-else-if="current.status === 'error' && $slots.error"
    name="error"
    :document="current as FailedDocumentInfo"
  />
  <slot v-else name="fallback" />
</template>
