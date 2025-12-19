import { h, Fragment } from 'preact';
import { useCaptureCapability } from '@embedpdf/plugin-capture/preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';

interface CaptureData {
  pageIndex: number;
  rect: any;
  blob: Blob;
}

export function Capture() {
  const { provides: capture } = useCaptureCapability();
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
          <div className="flex justify-end space-x-3 border-t border-gray-200 pt-4">
            <Button
              onClick={handleClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!captureData}
              className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm text-white hover:!bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Hidden download link */}
      <a ref={downloadLinkRef} style={{ display: 'none' }} href="" download="" />
    </>
  );
}
