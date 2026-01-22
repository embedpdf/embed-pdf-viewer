<template>
  <Dialog
    :open="isOpen ?? false"
    :title="translate('link.title') || 'Insert Link'"
    :onClose="onClose"
  >
    <DialogContent>
      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Tab buttons -->
        <div class="flex border-b border-gray-200">
          <button
            type="button"
            :class="[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'url'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700',
            ]"
            @click="activeTab = 'url'"
          >
            {{ translate('link.url') || 'URL' }}
          </button>
          <button
            type="button"
            :class="[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'page'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700',
            ]"
            @click="activeTab = 'page'"
          >
            {{ translate('link.page') || 'Page' }}
          </button>
        </div>

        <!-- Tab content -->
        <div class="rounded-lg">
          <!-- URL Tab -->
          <div v-if="activeTab === 'url'">
            <label class="mb-2 block text-sm font-medium text-gray-700">
              {{ translate('link.enterUrl') || 'Enter URL' }}
            </label>
            <input
              type="url"
              v-model="url"
              placeholder="https://example.com"
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autofocus
            />
          </div>

          <!-- Page Tab -->
          <div v-else>
            <label class="mb-2 block text-sm font-medium text-gray-700">
              {{ translate('link.enterPage') || 'Enter Page Number' }}
            </label>
            <input
              type="number"
              :min="1"
              :max="totalPages"
              v-model.number="pageNumber"
              class="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autofocus
            />
            <p class="mt-1 text-xs text-gray-500">
              {{
                translate('link.pageRange', { params: { totalPages } }) || `Page 1 to ${totalPages}`
              }}
            </p>
          </div>
        </div>
      </form>
    </DialogContent>

    <DialogFooter>
      <Button variant="secondary" @click="onClose">
        {{ translate('common.cancel') || 'Cancel' }}
      </Button>
      <Button variant="primary" :disabled="!canSubmit" @click="handleSubmit">
        {{ translate('link.link') || 'Link' }}
      </Button>
    </DialogFooter>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useScrollCapability } from '@embedpdf/plugin-scroll/vue';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import { useSelectionCapability } from '@embedpdf/plugin-selection/vue';
import { useTranslations } from '@embedpdf/plugin-i18n/vue';
import {
  PdfActionType,
  PdfAnnotationSubtype,
  PdfAnnotationBorderStyle,
  PdfBlendMode,
  PdfLinkTarget,
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

const props = defineProps<Props>();

const { provides: scroll } = useScrollCapability();
const { provides: annotation } = useAnnotationCapability();
const { provides: selection } = useSelectionCapability();
const { translate } = useTranslations(() => props.documentId);

const activeTab = ref<LinkTab>('url');
const url = ref('');
const pageNumber = ref(1);

const totalPages = computed(() => {
  return scroll.value?.forDocument(props.documentId).getTotalPages() || 1;
});

const annotationScope = computed(() => {
  return annotation.value?.forDocument(props.documentId);
});

const selectionScope = computed(() => {
  return selection.value?.forDocument(props.documentId);
});

// Get context: selected annotation or text selection
const selectedAnnotation = computed(() => {
  return annotationScope.value?.getSelectedAnnotation();
});

const textSelection = computed(() => {
  return selectionScope.value?.getFormattedSelection() ?? [];
});

// Reset state when modal opens
watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      activeTab.value = 'url';
      url.value = '';
      pageNumber.value = 1;
    }
  },
);

const canSubmit = computed(() => {
  return activeTab.value === 'page' || url.value.trim().length > 0;
});

const handleSubmit = () => {
  // Build the target based on active tab
  let target: PdfLinkTarget;

  if (activeTab.value === 'url') {
    if (!url.value.trim()) return;
    target = {
      type: 'action',
      action: {
        type: PdfActionType.URI,
        uri: url.value.trim(),
      },
    };
  } else {
    target = {
      type: 'destination',
      destination: {
        pageIndex: pageNumber.value - 1, // Convert to 0-based
        zoom: {
          mode: PdfZoomMode.FitPage,
        },
        view: [],
      },
    };
  }

  // Create links based on context
  if (selectedAnnotation.value) {
    // IRT-linked links from selected annotation
    const anno = selectedAnnotation.value;
    const rects = 'segmentRects' in anno.object ? anno.object.segmentRects : [anno.object.rect];

    for (const rect of rects ?? []) {
      annotationScope.value?.createAnnotation(anno.object.pageIndex, {
        id: uuidV4(),
        type: PdfAnnotationSubtype.LINK,
        pageIndex: anno.object.pageIndex,
        rect,
        inReplyToId: anno.object.id,
        replyType: PdfAnnotationReplyType.Group,
        target,
        strokeStyle: PdfAnnotationBorderStyle.UNDERLINE,
        strokeColor: '#0000FF',
        strokeWidth: 2,
      });
    }
  } else if (textSelection.value.length > 0) {
    const selectionText = selectionScope.value?.getSelectedText();

    // Create transparent highlight parent with IRT-linked links for each selection
    for (const sel of textSelection.value) {
      selectionText?.wait((text) => {
        // Create invisible highlight as parent annotation
        const highlightId = uuidV4();
        annotationScope.value?.createAnnotation(sel.pageIndex, {
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
          annotationScope.value?.createAnnotation(sel.pageIndex, {
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
        annotationScope.value?.selectAnnotation(sel.pageIndex, highlightId);
      }, ignore);
    }
    selectionScope.value?.clear();
  }

  props.onClose?.();
};
</script>
