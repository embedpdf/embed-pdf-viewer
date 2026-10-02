<!--
  Renders its content only while this subtree has a ready document: the structural way to say
  "this UI is defined over a document". Workspace UI (toolbars, commands, translations) lives
  outside the gate; document UI (the Stage, panels, page chrome) inside it. A document that waits
  for its password, or failed, shows `locked` or `error` with it, or else `fallback`.
  `<DocumentScope>` picks which document; this decides whether there is one.
-->
<script lang="ts">
  import type { FailedDocumentInfo, LockedDocumentInfo } from '@embedpdf/core';
  import { useDocument } from './documents.svelte';
  import type { DocumentGateProps } from './props';

  let { fallback, locked, error, children }: DocumentGateProps = $props();

  const document = useDocument((info) => info);
</script>

{#if document.current.status === 'ready'}
  {@render children?.()}
{:else if document.current.status === 'locked' && locked}
  {@render locked(document.current as LockedDocumentInfo)}
{:else if document.current.status === 'error' && error}
  {@render error(document.current as FailedDocumentInfo)}
{:else}
  {@render fallback?.()}
{/if}
