import { ReactNode, HTMLAttributes, CSSProperties } from '@framework';
import { usePinch } from '../hooks';

type PinchWrapperProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  children: ReactNode;
  documentId: string;
  style?: CSSProperties;
};

export function PinchWrapper({ children, documentId, style, ...props }: PinchWrapperProps) {
  const { elementRef } = usePinch(documentId);

  return (
    <div
      ref={elementRef}
      {...props}
      style={{
        ...style,
        display: 'inline-block',
        overflow: 'visible',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}
