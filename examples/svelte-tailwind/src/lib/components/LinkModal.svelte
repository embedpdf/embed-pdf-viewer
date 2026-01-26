<script lang="ts">
  import { useScrollCapability } from '@embedpdf/plugin-scroll/svelte';
  import { useAnnotationCapability } from '@embedpdf/plugin-annotation/svelte';
  import { useSelectionCapability } from '@embedpdf/plugin-selection/svelte';
  import { useTranslations } from '@embedpdf/plugin-i18n/svelte';
  import {
    PdfActionType,
    PdfAnnotationSubtype,
    PdfAnnotationBorderStyle,
    PdfBlendMode,
    type PdfLinkTarget,
    uuidV4,
    PdfZoomMode,
    ignore,
    PdfAnnotationReplyType,
  } from '@embedpdf/models';
  import { Dialog, DialogContent, DialogFooter, Button } from './ui';

  type LinkTab = 'url' | 'page';

  interface Props {
    documentId: string;
    isOpen?: boolean;
    onClose?: () => void;
    onExited?: () => void;
  }

  let { documentId, isOpen = false, onClose, onExited }: Props = $props();

  const scrollCapability = useScrollCapability();
  const annotationCapability = useAnnotationCapability();
  const selectionCapability = useSelectionCapability();
  const { translate } = useTranslations(() => documentId);

  let activeTab = $state<LinkTab>('url');
  let url = $state('');
  let pageNumber = $state(1);

  const totalPages = $derived(
    scrollCapability.provides?.forDocument(documentId).getTotalPages() || 1,
  );

  const annotationScope = $derived(annotationCapability.provides?.forDocument(documentId));

  const selectionScope = $derived(selectionCapability.provides?.forDocument(documentId));

  // Get context: selected annotation or text selection
  const selectedAnnotation = $derived(annotationScope?.getSelectedAnnotation());
  const textSelection = $derived(selectionScope?.getFormattedSelection() ?? []);

  // Reset state when modal opens
  $effect(() => {
    if (isOpen) {
      activeTab = 'url';
      url = '';
      pageNumber = 1;
    }
  });

  const canSubmit = $derived(activeTab === 'page' || url.trim().length > 0);

  function handleSubmit() {
    // Build the target based on active tab
    let target: PdfLinkTarget;

    if (activeTab === 'url') {
      if (!url.trim()) return;
      target = {
        type: 'action',
        action: {
          type: PdfActionType.URI,
          uri: url.trim(),
        },
      };
    } else {
      target = {
        type: 'destination',
        destination: {
          pageIndex: pageNumber - 1, // Convert to 0-based
          zoom: {
            mode: PdfZoomMode.FitPage,
          },
          view: [],
        },
      };
    }

    // Create links based on context
    if (selectedAnnotation) {
      // IRT-linked links from selected annotation
      const rects =
        'segmentRects' in selectedAnnotation.object
          ? selectedAnnotation.object.segmentRects
          : [selectedAnnotation.object.rect];

      for (const rect of rects ?? []) {
        annotationScope?.createAnnotation(selectedAnnotation.object.pageIndex, {
          id: uuidV4(),
          type: PdfAnnotationSubtype.LINK,
          pageIndex: selectedAnnotation.object.pageIndex,
          rect,
          inReplyToId: selectedAnnotation.object.id,
          replyType: PdfAnnotationReplyType.Group,
          target,
          strokeStyle: PdfAnnotationBorderStyle.UNDERLINE,
          strokeColor: '#0000FF',
          strokeWidth: 2,
        });
      }
    } else if (textSelection.length > 0) {
      const selectionText = selectionScope?.getSelectedText();

      // Create transparent highlight parent with IRT-linked links for each selection
      for (const sel of textSelection) {
        selectionText?.wait((text) => {
          // Create invisible highlight as parent annotation
          const highlightId = uuidV4();
          annotationScope?.createAnnotation(sel.pageIndex, {
            id: highlightId,
            created: new Date(),
            flags: ['print'],
            type: PdfAnnotationSubtype.HIGHLIGHT,
            blendMode: PdfBlendMode.Multiply,
            pageIndex: sel.pageIndex,
            rect: sel.rect,
            segmentRects: sel.segmentRects,
            strokeColor: '#FFFFFF', // White/transparent
            opacity: 0, // Fully transparent
            custom: {
              text: text.join('\n'),
            },
          });

          // Create link annotations for each segment with IRT to the highlight
          const segmentRects = sel.segmentRects ?? [sel.rect];
          for (const segmentRect of segmentRects) {
            annotationScope?.createAnnotation(sel.pageIndex, {
              id: uuidV4(),
              type: PdfAnnotationSubtype.LINK,
              pageIndex: sel.pageIndex,
              rect: segmentRect,
              inReplyToId: highlightId,
              replyType: PdfAnnotationReplyType.Group,
              target,
              strokeStyle: PdfAnnotationBorderStyle.UNDERLINE,
              strokeColor: '#0000FF',
              strokeWidth: 2,
            });
          }

          // Select the highlight annotation
          annotationScope?.selectAnnotation(sel.pageIndex, highlightId);
        }, ignore);
      }
      selectionScope?.clear();
    }

    onClose?.();
  }

  function handleFormSubmit(e: Event) {
    e.preventDefault();
    handleSubmit();
  }

  function handlePageInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(val)) {
      pageNumber = Math.max(1, Math.min(totalPages, val));
    }
  }
</script>

<Dialog open={isOpen} title={translate('link.title') || 'Insert Link'} {onClose}>
  {#snippet children()}
    <DialogContent>
      {#snippet children()}
        <form onsubmit={handleFormSubmit} class="space-y-6">
          <!-- Tab buttons -->
          <div class="flex border-b border-gray-200">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'url'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'}"
              onclick={() => (activeTab = 'url')}
            >
              {translate('link.url') || 'URL'}
            </button>
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium transition-colors {activeTab === 'page'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'}"
              onclick={() => (activeTab = 'page')}
            >
              {translate('link.page') || 'Page'}
            </button>
          </div>

          <!-- Tab content -->
          <div class="rounded-lg">
            {#if activeTab === 'url'}
              <div>
                <label for="link-url-input" class="mb-2 block text-sm font-medium text-gray-700">
                  {translate('link.enterUrl') || 'Enter URL'}
                </label>
                <input
                  id="link-url-input"
                  type="url"
                  bind:value={url}
                  placeholder="https://example.com"
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            {:else}
              <div>
                <label for="link-page-input" class="mb-2 block text-sm font-medium text-gray-700">
                  {translate('link.enterPage') || 'Enter Page Number'}
                </label>
                <input
                  id="link-page-input"
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageNumber}
                  oninput={handlePageInput}
                  class="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p class="mt-1 text-xs text-gray-500">
                  {translate('link.pageRange', { params: { totalPages } }) ||
                    `Page 1 to ${totalPages}`}
                </p>
              </div>
            {/if}
          </div>
        </form>
      {/snippet}
    </DialogContent>

    <DialogFooter>
      {#snippet children()}
        <Button variant="secondary" onclick={onClose}>
          {translate('common.cancel') || 'Cancel'}
        </Button>
        <Button variant="primary" disabled={!canSubmit} onclick={handleSubmit}>
          {translate('link.link') || 'Link'}
        </Button>
      {/snippet}
    </DialogFooter>
  {/snippet}
</Dialog>
