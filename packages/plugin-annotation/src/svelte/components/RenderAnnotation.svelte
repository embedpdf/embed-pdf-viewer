<script lang="ts">
  import { ignore, type PdfAnnotationObject, PdfErrorCode } from '@embedpdf/models';
  import type { HTMLImgAttributes } from 'svelte/elements';
  import { useAnnotationCapability } from '../hooks';

  interface RenderAnnotationProps extends Omit<HTMLImgAttributes, 'style'> {
    pageIndex: number;
    annotation: PdfAnnotationObject;
    scaleFactor?: number;
    dpr?: number;
    style?: Record<string, string | number | undefined>;
  }

  let {
    pageIndex,
    annotation,
    scaleFactor = 1,
    style,
    ...restProps
  }: RenderAnnotationProps = $props();

  const annotationCapability = useAnnotationCapability();

  let imageUrl = $state<string | null>(null);
  let urlRef: string | null = null;

  const { width, height } = $derived(annotation.rect.size);

  // Clone to avoid reactive proxies that Web Workers cannot clone
  const createPlainAnnotation = (anno: PdfAnnotationObject): PdfAnnotationObject => {
    return JSON.parse(JSON.stringify(anno));
  };

  // Effect to render annotation
  $effect(() => {
    if (annotationCapability.provides) {
      const plainAnnotation = createPlainAnnotation(annotation);
      const task = annotationCapability.provides.renderAnnotation({
        pageIndex,
        annotation: plainAnnotation,
        options: {
          scaleFactor,
          dpr: window.devicePixelRatio,
        },
      });

      task.wait((blob) => {
        const url = URL.createObjectURL(blob);
        imageUrl = url;
        urlRef = url;
      }, ignore);

      return () => {
        if (urlRef) {
          URL.revokeObjectURL(urlRef);
          urlRef = null;
        } else {
          task.abort({
            code: PdfErrorCode.Cancelled,
            message: 'canceled render task',
          });
        }
      };
    }
  });

  function handleImageLoad() {
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
  }
</script>

{#if imageUrl}
  <img
    alt=""
    src={imageUrl}
    onload={handleImageLoad}
    {...restProps}
    style:width="100%"
    style:height="100%"
    style:display="block"
    {style}
  />
{/if}
