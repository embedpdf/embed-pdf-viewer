import { ReactNode, useEffect, useRef, HTMLAttributes, CSSProperties } from '@framework';
import { createPointerProvider } from '../utils';
import { useInteractionManagerCapability } from '../hooks';

interface GlobalPointerProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  documentId: string;
  style?: CSSProperties;
}

export const GlobalPointerProvider = ({
  children,
  documentId,
  style,
  ...props
}: GlobalPointerProviderProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { provides: cap } = useInteractionManagerCapability();

  useEffect(() => {
    if (!cap || !ref.current) return;

    return createPointerProvider(cap, { type: 'global', documentId }, ref.current);
  }, [cap, documentId]);

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        height: '100%',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
