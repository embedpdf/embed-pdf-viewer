<script lang="ts">
  import type { AnnotationAppearanceImage } from '@embedpdf/models';

  interface Props {
    appearance: AnnotationAppearanceImage;
    style?: string;
  }

  let { appearance, style }: Props = $props();

  let canvas: HTMLCanvasElement;

  $effect(() => {
    if (!canvas) return;

    const { data } = appearance;
    canvas.width = data.width;
    canvas.height = data.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = new ImageData(data.data, data.width, data.height);
    ctx.putImageData(imageData, 0, 0);
  });
</script>

<canvas
  bind:this={canvas}
  style="position: absolute; width: 100%; height: 100%; display: block; pointer-events: none; {style ??
    ''}"
></canvas>
