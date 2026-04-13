import { useEffect, useState, useRef, HTMLAttributes, CSSProperties } from '@framework';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useStampCapability } from '../hooks';

type StampImgProps = Omit<HTMLAttributes<HTMLImageElement>, 'style'> & {
  libraryId: string;
  pageIndex: number;
  width: number;
  dpr?: number;
  style?: CSSProperties;
};

export function StampImg({ libraryId, pageIndex, width, dpr, style, ...props }: StampImgProps) {
  const { provides } = useStampCapability();
  const [url, setUrl] = useState<string>();
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!provides) return;

    const task = provides.renderStamp(libraryId, pageIndex, width, dpr ?? window.devicePixelRatio);

    task.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      setUrl(objectUrl);
    }, ignore);

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled stamp render task',
        });
      }
    };
  }, [provides, libraryId, pageIndex, width, dpr]);

  const handleImageLoad = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  return url ? <img src={url} onLoad={handleImageLoad} style={style} {...props} /> : null;
}
