import { BasePluginConfig, EventHook } from '@embedpdf/core';

export type PanDefaultMode = 'never' | 'mobile' | 'always';

export interface PanPluginConfig extends BasePluginConfig {
  /** When should pan be the default interaction mode?
   *  – 'never' (default) : pointerMode stays the default
   *  – 'mobile' : default only on touch devices
   *  – 'always' : default on every device           */
  defaultMode?: PanDefaultMode;
}

export interface PanCapability {
  onPanModeChange: EventHook<boolean>;
  enablePan: () => void;
  disablePan: () => void;
  togglePan: () => void;
  makePanDefault: (autoActivate?: boolean) => void;
}
