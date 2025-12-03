import { ReactNode, HTMLAttributes, CSSProperties } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Rotation } from '@embedpdf/models';

import { useRotatePlugin } from '../hooks';

type RotateProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  children: ReactNode;
  documentId: string;
  pageIndex: number;
  rotation?: Rotation;
  scale?: number;
  style?: CSSProperties;
};

export function Rotate({
  children,
  documentId,
  pageIndex,
  rotation: rotationOverride,
  scale: scaleOverride,
  style,
  ...props
}: RotateProps) {
  const { plugin: rotatePlugin } = useRotatePlugin();
  const documentState = useDocumentState(documentId);

  const page = documentState?.document?.pages?.[pageIndex];
  const width = page?.size?.width ?? 0;
  const height = page?.size?.height ?? 0;
  const rotation = rotationOverride ?? documentState?.rotation ?? 0;
  const scale = scaleOverride ?? documentState?.scale ?? 1;

  const matrix =
    rotatePlugin?.getMatrixAsString({
      width: width * scale,
      height: height * scale,
      rotation: rotation,
    }) ?? 'matrix(1, 0, 0, 1, 0, 0)';

  if (!page) return null;

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
