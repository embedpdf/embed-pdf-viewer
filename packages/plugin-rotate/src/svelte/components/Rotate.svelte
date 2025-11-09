<script lang="ts">
  import type { Rotation } from '@embedpdf/models';
  import type { Snippet } from 'svelte';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useRotatePlugin } from '../hooks';

  interface RotateProps {
    documentId: string;
    pageIndex: number;
    rotation?: Rotation;
    scale?: number;
    children?: Snippet;
  }

  let {
    documentId,
    pageIndex,
    rotation: rotationOverride,
    scale: scaleOverride,
    children,
  }: RotateProps = $props();

  const { plugin: rotatePlugin } = useRotatePlugin();
  const documentState = useDocumentState(documentId);

  const page = $derived(documentState.current?.document?.pages?.[pageIndex]);
  const width = $derived(page?.size?.width ?? 0);
  const height = $derived(page?.size?.height ?? 0);

  const rotation = $derived(
    rotationOverride !== undefined ? rotationOverride : (documentState.current?.rotation ?? 0),
  );

  const scale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  const matrix = $derived(
    rotatePlugin
      ? rotatePlugin.getMatrixAsString({
          width: width * scale,
          height: height * scale,
          rotation: rotation,
        })
      : 'matrix(1, 0, 0, 1, 0, 0)',
  );
</script>

{#if page}
  <div style:position="absolute" style:transform-origin="0 0" style:transform={matrix}>
    {@render children?.()}
  </div>
{/if}
