import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/preact';
import { useSelectionCapability } from '@embedpdf/plugin-selection/preact';
import {
  PdfActionType,
  PdfAnnotationSubtype,
  PdfAnnotationBorderStyle,
  PdfBlendMode,
  PdfLinkTarget,
  uuidV4,
  PdfZoomMode,
  ignore,
} from '@embedpdf/models';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { TabButton } from './ui/tab-button';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

type LinkTab = 'url' | 'page';

interface LinkModalProps {
  documentId: string;
  isOpen?: boolean;
  onClose?: () => void;
  onExited?: () => void;
}

export function LinkModal({ documentId, isOpen, onClose, onExited }: LinkModalProps) {
  const { provides: scroll } = useScrollCapability();
  const { provides: annotation } = useAnnotationCapability();
  const { provides: selection } = useSelectionCapability();
  const { translate } = useTranslations(documentId);

  const [activeTab, setActiveTab] = useState<LinkTab>('url');
  const [url, setUrl] = useState('');
  const [pageNumber, setPageNumber] = useState(1);

  const totalPages = scroll?.forDocument(documentId).getTotalPages() || 1;
  const annotationScope = annotation?.forDocument(documentId);
  const selectionScope = selection?.forDocument(documentId);

  // Get context: selected annotation or text selection
  const selectedAnnotation = annotationScope?.getSelectedAnnotation();
  const textSelection = selectionScope?.getFormattedSelection() ?? [];

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('url');
      setUrl('');
      setPageNumber(1);
    }
  }, [isOpen]);

  const handleSubmit = () => {
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
  };

  const canSubmit = activeTab === 'page' || url.trim().length > 0;

  return (
    <Dialog
      open={isOpen ?? false}
      title={translate('link.title') || 'Insert Link or Page'}
      onClose={onClose}
      onExited={onExited}
      className="md:w-[28rem]"
    >
      <div className="space-y-6">
        {/* Tab buttons */}
        <div className="border-border-subtle flex border-b">
          <TabButton active={activeTab === 'url'} onClick={() => setActiveTab('url')}>
            {translate('link.url') || 'URL'}
          </TabButton>
          <TabButton active={activeTab === 'page'} onClick={() => setActiveTab('page')}>
            {translate('link.page') || 'Page'}
          </TabButton>
        </div>

        {/* Tab content */}
        <div className="bg-bg-muted rounded-lg">
          {activeTab === 'url' ? (
            <div>
              <label className="text-fg-secondary mb-2 block text-sm font-medium">
                {translate('link.enterUrl') || 'Enter URL'}
              </label>
              <input
                type="url"
                value={url}
                onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
                placeholder="https://example.com"
                className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 text-base focus:outline-none focus:ring-1"
                autoFocus
              />
            </div>
          ) : (
            <div>
              <label className="text-fg-secondary mb-2 block text-sm font-medium">
                {translate('link.enterPage') || 'Enter Page Number'}
              </label>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageNumber}
                onInput={(e) => {
                  const val = parseInt((e.target as HTMLInputElement).value, 10);
                  if (!isNaN(val)) setPageNumber(Math.max(1, Math.min(totalPages, val)));
                }}
                className="border-border-default bg-bg-input text-fg-primary focus:border-accent focus:ring-accent w-full rounded-md border px-3 py-2 text-base focus:outline-none focus:ring-1"
                autoFocus
              />
              <p className="text-fg-muted mt-1 text-xs">
                {translate('link.pageRange', { params: { totalPages } }) ||
                  `Page 1 to ${totalPages}`}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
          <Button
            onClick={onClose}
            className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm"
          >
            {translate('common.cancel') || 'Cancel'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-accent text-fg-on-accent hover:!bg-accent-hover rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translate('link.link') || 'Link'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
