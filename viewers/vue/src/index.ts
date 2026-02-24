import { defineComponent, ref, onMounted, onBeforeUnmount, h, type PropType } from 'vue';
import EmbedPDF, {
  type EmbedPdfContainer,
  type PDFViewerConfig,
  type PluginRegistry,
} from '@embedpdf/snippet';

// Re-export everything from snippet for convenience
export * from '@embedpdf/snippet';

export interface PDFViewerExpose {
  /** The EmbedPdfContainer element */
  container: EmbedPdfContainer | null;
  /** Promise that resolves to the PluginRegistry */
  registry: Promise<PluginRegistry> | null;
}

/**
 * Vue component for embedding PDF documents
 *
 * @example
 * ```vue
 * <template>
 *   <PDFViewer
 *     :config="{ src: '/document.pdf', theme: { preference: 'system' } }"
 *     :style="{ width: '100%', height: '100vh' }"
 *     @ready="onReady"
 *   />
 * </template>
 *
 * <script setup lang="ts">
 * import { PDFViewer } from '@embedpdf/vue-pdf-viewer';
 *
 * function onReady(registry) {
 *   console.log('PDF viewer ready', registry);
 * }
 * </script>
 * ```
 */
export const PDFViewer = defineComponent({
  name: 'PDFViewer',

  props: {
    /** Full configuration for the PDF viewer */
    config: {
      type: Object as PropType<PDFViewerConfig>,
      default: () => ({}),
    },
  },

  emits: {
    /** Emitted when the viewer is initialized */
    init: (_container: EmbedPdfContainer) => true,
    /** Emitted when the registry is ready */
    ready: (_registry: PluginRegistry) => true,
  },

  setup(props, { emit, expose, attrs }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    const viewerRef = ref<EmbedPdfContainer | null>(null);

    // Expose container and registry to parent
    expose({
      get container() {
        return viewerRef.value;
      },
      get registry() {
        return viewerRef.value?.registry ?? null;
      },
    } as PDFViewerExpose);

    onMounted(() => {
      if (!containerRef.value) return;

      // Initialize the viewer with the config prop
      const viewer = EmbedPDF.init({
        type: 'container',
        target: containerRef.value,
        ...props.config,
      });

      if (viewer) {
        viewerRef.value = viewer;
        emit('init', viewer);

        // Emit ready when registry is available
        viewer.registry.then((registry) => {
          emit('ready', registry);
        });
      }
    });

    onBeforeUnmount(() => {
      // Cleanup: remove the viewer element
      if (viewerRef.value && containerRef.value) {
        containerRef.value.innerHTML = '';
        viewerRef.value = null;
      }
    });

    return () =>
      h('div', {
        ref: containerRef,
        class: attrs.class,
        style: attrs.style,
      });
  },
});

export default PDFViewer;
