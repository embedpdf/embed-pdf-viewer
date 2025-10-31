<script lang="ts">
    import { useAnnotationPlugin } from '../hooks';
    import type { AnyPreviewState, HandlerServices } from '@embedpdf/plugin-annotation';
    import PreviewRenderer from './PreviewRenderer.svelte';

    interface AnnotationPaintLayerProps {
        pageIndex: number;
        scale: number;
    }

    let { pageIndex, scale }: AnnotationPaintLayerProps = $props();

    const annotationPlugin = useAnnotationPlugin();
    let previews = $state<Map<string, AnyPreviewState>>(new Map());

    let fileInputRef: HTMLInputElement | null = $state(null);
    let canvasRef: HTMLCanvasElement | null = $state(null);

    const services: HandlerServices = {
        requestFile: ({ accept, onFile }) => {
            if (!fileInputRef) return;
            const input = fileInputRef;
            input.accept = accept;
            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    onFile(file);
                    input.value = '';
                }
            };
            input.click();
        },
        processImage: ({ source, maxWidth, maxHeight, onComplete }) => {
            const canvas = canvasRef;
            if (!canvas || !canvas.getContext) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                let { naturalWidth: width, naturalHeight: height } = img;

                // --- SCALING LOGIC ---
                // Calculate the scale factor to fit within maxWidth and maxHeight
                const scaleX = maxWidth ? maxWidth / width : 1;
                const scaleY = maxHeight ? maxHeight / height : 1;
                const scaleFactor = Math.min(scaleX, scaleY, 1); // Ensure we don't scale up

                const finalWidth = width * scaleFactor;
                const finalHeight = height * scaleFactor;

                canvas.width = finalWidth;
                canvas.height = finalHeight;
                ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

                const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight);
                if (typeof source !== 'string') URL.revokeObjectURL(img.src);

                onComplete({ imageData, width: finalWidth, height: finalHeight });
            };
            img.src = typeof source === 'string' ? source : URL.createObjectURL(source);
        },
    };

    $effect(() => {
        if (!annotationPlugin.plugin) return;

        return annotationPlugin.plugin.registerPageHandlers(pageIndex, scale, {
            services,
            onPreview: (toolId, state) => {
                previews = new Map(previews);
                if (state) {
                    previews.set(toolId, state);
                } else {
                    previews.delete(toolId);
                }
            },
        });
    });
</script>

<!-- Hidden DOM elements required by services -->
<input bind:this={fileInputRef} type="file" style:display="none">
<canvas bind:this={canvasRef} style:display="none"></canvas>

<!-- Render any active previews from any tool -->
{#each Array.from(previews.entries()) as [toolId, preview] (toolId)}
    <PreviewRenderer {preview} {scale} />
{/each}
