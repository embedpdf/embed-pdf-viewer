import { Rect, Rotation } from '@embedpdf/models';
import { getCounterRotation } from '@embedpdf/utils';
import { ReactNode, CSSProperties, PointerEvent, Fragment, TouchEvent } from '@framework';

interface CounterRotateProps {
  rect: Rect;
  rotation: Rotation;
}

export interface MenuWrapperProps {
  style: CSSProperties;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onTouchStart: (e: TouchEvent<HTMLDivElement>) => void;
}

interface CounterRotateComponentProps extends CounterRotateProps {
  children: (props: {
    matrix: string;
    rect: Rect;
    menuWrapperProps: MenuWrapperProps;
  }) => ReactNode;
}

export function CounterRotate({ children, ...props }: CounterRotateComponentProps) {
  const { rect, rotation } = props;
  const { matrix, width, height } = getCounterRotation(rect, rotation);

  const menuWrapperStyle: CSSProperties = {
    position: 'absolute',
    left: rect.origin.x,
    top: rect.origin.y,
    transform: matrix,
    transformOrigin: '0 0',
    width: width,
    height: height,
    pointerEvents: 'none',
    zIndex: 3,
  };

  const menuWrapperProps = {
    style: menuWrapperStyle,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => e.stopPropagation(),
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => e.stopPropagation(),
  };

  return (
    <Fragment>
      {children({
        menuWrapperProps,
        matrix,
        rect: {
          origin: { x: rect.origin.x, y: rect.origin.y },
          size: { width: width, height: height },
        },
      })}
    </Fragment>
  );
}
