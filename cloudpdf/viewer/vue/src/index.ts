/**
 * @cloudpdf/viewer-vue: the full viewer as a Vue component, wired to CloudPDF.
 *
 * ```vue
 * <script setup lang="ts">
 * import { CloudPDFViewer } from '@cloudpdf/viewer-vue';
 *
 * defineProps<{ token: string }>();
 * </script>
 *
 * <template>
 *   <CloudPDFViewer base-url="https://api.cloudpdf.com" :doc-token="token" style="height: 100vh" />
 * </template>
 * ```
 *
 * A cloud door, and nothing more. It renders the open-source <PDFViewer> from
 * `@embedpdf/viewer-vue/core`, the engine-agnostic door, where `engine` is
 * required, and supplies that engine from the cloud options through
 * `resolveCloudConfig`. Because the core door registers no default engine, the
 * local PDFium engine (the wasm, the worker source, the main-thread recipe) is
 * not part of startup. The only import of it is the lazy one the stamp
 * libraries make the first time someone opens Stamps or Signatures.
 *
 * Everything the open viewer takes (`layout`, `commands`, `icons`, `strings`,
 * `theme`, `plugins`, `<ToolbarItem>`, `<Panel>` and `<Region>` in its slot,
 * `@ready`, `usePDFViewer()`) works here unchanged (see `@embedpdf/viewer-vue`).
 * This file adds the CloudPDF connection and the document shorthands, and
 * leaves out `src`, `scope` and `identity`: the document's token names the
 * document and carries who the user is and what they may do.
 */
import { resolveCloudConfig, type ViewerConfig } from '@cloudpdf/viewer/config';
import {
  PDFViewer,
  type PDFViewerComponent,
  type PDFViewerEmits,
  type PDFViewerPropsOf,
  type PDFViewerSlots,
  type PanelResizeEvent,
  type Viewer,
} from '@embedpdf/viewer-vue/core';
import { computed, defineComponent, h, shallowRef, toRaw } from 'vue';

// The open viewer's whole vocabulary rides along, so a cloud app imports one package.
export * from '@embedpdf/viewer-vue/core';
export { resolveCloudConfig } from '@cloudpdf/viewer/config';
// The cloud's `ViewerConfig`, in place of the one `export *` brings: one name per door.
export type { CloudSource, ViewerConfig } from '@cloudpdf/viewer/config';

/**
 * The cloud connection and document shorthands, plus every viewer option except `engine` (this
 * door supplies it), `src` (a cloud document is named by `docToken`/`docId`, not by URL), and
 * `scope`/`identity` (the token carries them). The callbacks are events, as on <PDFViewer>.
 */
export type CloudPDFViewerProps = PDFViewerPropsOf<ViewerConfig>;

/**
 * Every key of the cloud config, as a prop (TypeScript keeps the list complete). `readOnly`
 * written without a value is `true`, as on <PDFViewer>.
 */
const CLOUD_PROPS = {
  baseUrl: null,
  token: null,
  fetch: null,
  docToken: null,
  docId: null,
  shareToken: null,
  sharePassword: null,
  docAffinityHeader: null,
  onRetry: null,
  documents: null,
  stamps: null,
  commands: null,
  icons: null,
  strings: null,
  locale: null,
  disable: null,
  readOnly: { type: [Boolean, Object], default: undefined },
  notAllowed: null,
  layout: null,
  signatures: null,
  plugins: null,
  theme: null,
} satisfies Record<keyof CloudPDFViewerProps, unknown>;

/**
 * The full viewer on CloudPDF. Its type adds what a template ref reads (`elementRef`), as
 * <PDFViewer>'s does.
 */
export const CloudPDFViewer = defineComponent<
  CloudPDFViewerProps,
  PDFViewerEmits,
  string,
  PDFViewerSlots
>(
  (props, { emit, slots, expose }) => {
    // The engine, documents and stamps are made from the cloud options once, when the viewer
    // starts, like every prop that isn't live; the live ones pass through on every render.
    const { engine, documents, stamps } = resolveCloudConfig({ ...toRaw(props) });
    const viewer = shallowRef<InstanceType<typeof PDFViewer> | null>(null);
    expose({ elementRef: computed(() => viewer.value?.elementRef ?? null) });
    return () =>
      h(
        PDFViewer,
        {
          ...resolveCloudConfig(props),
          engine,
          documents,
          stamps,
          ref: viewer,
          onReady: (ready: Viewer) => emit('ready', ready),
          onDocumentChange: (documentId: string | null) => emit('document-change', documentId),
          onPanelResize: (event: PanelResizeEvent) => emit('panel-resize', event),
        },
        slots,
      );
  },
  {
    name: 'CloudPDFViewer',
    props: CLOUD_PROPS,
    emits: ['ready', 'document-change', 'panel-resize'],
  },
) as PDFViewerComponent<CloudPDFViewerProps>;
