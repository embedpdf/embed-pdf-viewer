import { h, Fragment } from 'preact';
import { useCaptureCapability } from '@embedpdf/plugin-capture/preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

export interface CaptureData {
  pageIndex: number;
  rect: any;
  blob: Blob;
}

export interface CaptureProps {
  documentId: string;
}

export function Capture({ documentId }: CaptureProps) {
  const { provides: capture } = useCaptureCapability();
  const [open, setOpen] = useState(false);
  const [captureData, setCaptureData] = useState<CaptureData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);
  const { translate } = useTranslations(documentId);

  const handleClose = () => {
    // Clean up object URLs
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    setOpen(false);
    setCaptureData(null);
    setPreviewUrl(null);
  };

  const handleDownload = () => {
    if (!captureData || !downloadLinkRef.current) return;

    // Create download URL and trigger download
    const url = URL.createObjectURL(captureData.blob);
    setDownloadUrl(url);

    // Use the ref to trigger download
    downloadLinkRef.current.href = url;
    downloadLinkRef.current.download = `pdf-capture-page-${captureData.pageIndex + 1}.png`;
    downloadLinkRef.current.click();

    handleClose();
  };

  useEffect(() => {
    if (!capture) return;

    return capture.onCaptureArea(({ pageIndex, rect, blob }) => {
      setCaptureData({ pageIndex, rect, blob });

      // Create preview URL
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      setOpen(true);
    });
  }, [capture]);

  const handleImageLoad = () => {
    // Clean up the object URL after image loads
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        title={translate('capture.title')}
        className="md:w-[48rem]"
      >
        <div className="space-y-6">
          <div className="flex justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                onLoad={handleImageLoad}
                alt="Captured PDF area"
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                  display: 'block',
                }}
              />
            )}
          </div>
          <div className="border-border-subtle flex justify-end space-x-3 border-t pt-4">
            <Button
              onClick={handleClose}
              className="border-border-default bg-bg-surface text-fg-secondary hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translate('capture.cancel')}
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!captureData}
              className="bg-accent text-fg-on-accent hover:!bg-accent-hover flex items-center space-x-2 rounded-md border border-transparent px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {translate('capture.download')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Hidden download link */}
      <a ref={downloadLinkRef} style={{ display: 'none' }} href="" download="" />
    </>
  );
}
