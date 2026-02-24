import type { CSSProperties } from 'vue';

export interface MenuWrapperProps {
  style: CSSProperties;
  onPointerdown: (e: PointerEvent) => void;
  onTouchstart: (e: TouchEvent) => void;
}
