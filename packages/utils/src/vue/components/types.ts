import type { CSSProperties } from 'vue';

export interface MenuWrapperProps {
  style: CSSProperties;
  onPointerDown: (e: PointerEvent) => void;
  onTouchStart: (e: TouchEvent) => void;
}
