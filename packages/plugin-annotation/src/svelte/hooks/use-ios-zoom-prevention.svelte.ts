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

export function useIOSZoomPrevention(getComputedFontPx: () => number, getActive: () => boolean) {
  const isIOS = getIsIOS();

  const needsComp = $derived.by(() => {
    const px = getComputedFontPx();
    return isIOS && getActive() && px > 0 && px < MIN_IOS_FOCUS_FONT_PX;
  });

  const adjustedFontPx = $derived(needsComp ? MIN_IOS_FOCUS_FONT_PX : getComputedFontPx());
  const scaleComp = $derived(needsComp ? getComputedFontPx() / MIN_IOS_FOCUS_FONT_PX : 1);

  const wrapperStyle = $derived.by(() => {
    if (!needsComp) return '';
    const s = scaleComp;
    return `width: ${100 / s}%; height: ${100 / s}%; transform: scale(${s}); transform-origin: top left;`;
  });

  return {
    get needsComp() {
      return needsComp;
    },
    get adjustedFontPx() {
      return adjustedFontPx;
    },
    get scaleComp() {
      return scaleComp;
    },
    get wrapperStyle() {
      return wrapperStyle;
    },
  };
}
