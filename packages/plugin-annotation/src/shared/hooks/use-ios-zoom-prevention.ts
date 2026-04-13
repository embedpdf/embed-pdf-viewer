import { useMemo, CSSProperties } from '@framework';

const MIN_IOS_FOCUS_FONT_PX = 16;

function detectIOS(): boolean {
  try {
    const nav = navigator as any;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && nav?.maxTouchPoints > 1)
    );
  } catch {
    return false;
  }
}

let _isIOS: boolean | undefined;
function getIsIOS(): boolean {
  if (_isIOS === undefined) {
    _isIOS = detectIOS();
  }
  return _isIOS;
}

/**
 * Prevents iOS Safari from auto-zooming when a focused input's computed
 * font-size is below 16px. Returns an adjusted font size and optional
 * wrapper style that uses `transform: scale()` to visually match the
 * intended size while keeping the real font at >= 16px.
 *
 * @param computedFontPx - The intended on-screen font size (fontSize * scale)
 * @param active - Whether compensation should apply (e.g. isEditing, or always true for form inputs)
 */
export function useIOSZoomPrevention(computedFontPx: number, active: boolean) {
  const isIOS = getIsIOS();

  return useMemo(() => {
    const needsComp =
      isIOS && active && computedFontPx > 0 && computedFontPx < MIN_IOS_FOCUS_FONT_PX;
    const adjustedFontPx = needsComp ? MIN_IOS_FOCUS_FONT_PX : computedFontPx;
    const scaleComp = needsComp ? computedFontPx / MIN_IOS_FOCUS_FONT_PX : 1;

    const wrapperStyle: CSSProperties | undefined = needsComp
      ? {
          width: `${100 / scaleComp}%`,
          height: `${100 / scaleComp}%`,
          transform: `scale(${scaleComp})`,
          transformOrigin: 'top left',
        }
      : undefined;

    return { needsComp, adjustedFontPx, scaleComp, wrapperStyle };
  }, [isIOS, active, computedFontPx]);
}
