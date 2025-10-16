import { ReactNode, HTMLAttributes, CSSProperties } from '@framework';
import { Size } from '@embedpdf/models';

import { useRotate } from '../hooks';

type RotateProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  children: ReactNode;
  documentId: string;
  pageSize: Size;
  style?: CSSProperties;
};

export function Rotate({ children, documentId, pageSize, style, ...props }: RotateProps) {
  const { provides: rotateScope } = useRotate(documentId);

  const matrix =
    rotateScope?.getMatrixAsString({
      w: pageSize.width,
      h: pageSize.height,
    }) ?? 'matrix(1, 0, 0, 1, 0, 0)';

  return (
    <div
      {...props}
      style={{
        position: 'absolute',
        transformOrigin: '0 0',
        transform: matrix,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
