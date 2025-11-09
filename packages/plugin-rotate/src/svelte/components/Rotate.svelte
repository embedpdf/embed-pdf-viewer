<script lang="ts">
  import type { Rotation } from '@embedpdf/models';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import { useRotatePlugin } from '../hooks';

  type RotateProps = HTMLAttributes<HTMLDivElement> & {
    documentId: string;
    pageIndex: number;
    rotation?: Rotation;
    scale?: number;
    children?: Snippet;
    class?: string;
    style?: string;
  };

  let {
    documentId,
    pageIndex,
    rotation: rotationOverride,
    scale: scaleOverride,
    children,
    class: propsClass,
    style: propsStyle,
    ...restProps
  }: RotateProps = $props();

  const rotatePlugin = useRotatePlugin();
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
    rotatePlugin.plugin
      ? rotatePlugin.plugin.getMatrixAsString({
          width: width * scale,
          height: height * scale,
          rotation: rotation,
        })
      : 'matrix(1, 0, 0, 1, 0, 0)',
  );
</script>

{#if page}
  <div
    class={propsClass}
    style:position="absolute"
    style:transform-origin="0 0"
    style:transform={matrix}
    style={propsStyle}
    {...restProps}
  >
    {@render children?.()}
  </div>
{/if}
