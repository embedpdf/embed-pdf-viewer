import { AnnotationLayer, type HandleProps } from '@embedpdf/react/annotation';
import { RotationHandle } from './rotation-handle'; // drawn the same way

function Handle({ at, size, rotation }: HandleProps) {
  return (
    <div
      className="my-handle"
      style={{
        left: at.x - size / 2,
        top: at.y - size / 2,
        width: size,
        height: size,
        rotate: `${rotation}deg`,
      }}
    />
  );
}

export const Annotations = () => <AnnotationLayer components={{ Handle, RotationHandle }} />;
