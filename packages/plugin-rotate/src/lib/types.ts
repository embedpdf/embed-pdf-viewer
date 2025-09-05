import { BasePluginConfig, EventHook } from '@embedpdf/core';
import { Rotation } from '@embedpdf/models';

export interface RotatePluginConfig extends BasePluginConfig {
  defaultRotation?: Rotation;
}

export interface GetMatrixOptions {
  w: number;
  h: number;
}

export interface RotateCapability {
  onRotateChange: EventHook<Rotation>;
  setRotation(rotation: Rotation): void;
  getRotation(): Rotation;
  rotateForward(): void;
  rotateBackward(): void;
}

export interface RotateState {
  rotation: Rotation;
}
