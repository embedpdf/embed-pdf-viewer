import { useEffect, useRef, useState } from 'react';
import { useCapture } from '@embedpdf/plugin-capture/react';
import { Dialog, DialogContent, DialogFooter, Button } from './ui';

interface CaptureData {
  pageIndex: number;
  rect: any;
  blob: Blob;
}

type CaptureDialogProps = {
  documentId: string;
};

export function CaptureDialog({ documentId }: CaptureDialogProps) {
  const { provides: capture } = useCapture(documentId);
  const [open, setOpen] = useState(false);
  const [captureData, setCaptureData] = useState<CaptureData | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

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
      <Dialog open={open} onClose={handleClose} title="Capture PDF Area">
        <DialogContent>
          <div className="flex justify-center">
            {previewUrl && (
              <img
                src={previewUrl}
                onLoad={handleImageLoad}
                alt="Captured PDF area"
                className="block max-h-[400px] max-w-full rounded border border-gray-200"
              />
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleDownload} disabled={!captureData}>
            Download
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Hidden download link */}
      <a ref={downloadLinkRef} style={{ display: 'none' }} href="" download="" />
    </>
  );
}
