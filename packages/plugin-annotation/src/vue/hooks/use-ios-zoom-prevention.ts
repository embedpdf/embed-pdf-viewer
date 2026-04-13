import { computed, toValue, type CSSProperties, type MaybeRefOrGetter } from 'vue';

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

export function useIOSZoomPrevention(
  computedFontPx: MaybeRefOrGetter<number>,
  active: MaybeRefOrGetter<boolean>,
) {
  const isIOS = getIsIOS();

  return computed(() => {
    const px = toValue(computedFontPx);
    const isActive = toValue(active);
    const needsComp = isIOS && isActive && px > 0 && px < MIN_IOS_FOCUS_FONT_PX;
    const adjustedFontPx = needsComp ? MIN_IOS_FOCUS_FONT_PX : px;
    const scaleComp = needsComp ? px / MIN_IOS_FOCUS_FONT_PX : 1;

    const wrapperStyle: CSSProperties | undefined = needsComp
      ? {
          width: `${100 / scaleComp}%`,
          height: `${100 / scaleComp}%`,
          transform: `scale(${scaleComp})`,
          transformOrigin: 'top left',
        }
      : undefined;

    return { needsComp, adjustedFontPx, scaleComp, wrapperStyle };
  });
}
