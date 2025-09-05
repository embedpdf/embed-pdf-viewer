import { BasePluginConfig, EventHook } from '@embedpdf/core';

export interface SpreadPluginConfig extends BasePluginConfig {
  defaultSpreadMode?: SpreadMode;
}

export enum SpreadMode {
  None = 'none',
  Odd = 'odd',
  Even = 'even',
}

export interface SpreadCapability {
  onSpreadChange: EventHook<SpreadMode>;
  setSpreadMode(mode: SpreadMode): void;
  getSpreadMode(): SpreadMode;
}

export interface SpreadState {
  spreadMode: SpreadMode;
}
