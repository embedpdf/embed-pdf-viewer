import { BasePlugin, createBehaviorEmitter, PluginRegistry, setRotation } from '@embedpdf/core';
import { Rotation } from '@embedpdf/models';
import { GetMatrixOptions, RotateCapability, RotatePluginConfig } from './types';
import { getNextRotation, getPreviousRotation, getRotationMatrixString } from './utils';

export class RotatePlugin extends BasePlugin<RotatePluginConfig, RotateCapability> {
  static readonly id = 'rotate' as const;
  private readonly rotate$ = createBehaviorEmitter<Rotation>();

  constructor(id: string, registry: PluginRegistry, cfg: RotatePluginConfig) {
    super(id, registry);
    this.resetReady();
    const rotation = cfg.defaultRotation ?? this.coreState.core.rotation;
    this.setRotation(rotation);
    this.markReady();
  }

  async initialize(_config: RotatePluginConfig): Promise<void> {}

  private setRotation(rotation: Rotation): void {
    const pages = this.coreState.core.pages;
    if (!pages) {
      throw new Error('Pages not loaded');
    }

    this.rotate$.emit(rotation);
    this.dispatchCoreAction(setRotation(rotation));
  }

  private rotateForward(): void {
    const rotation = getNextRotation(this.coreState.core.rotation);
    this.setRotation(rotation);
  }

  private rotateBackward(): void {
    const rotation = getPreviousRotation(this.coreState.core.rotation);
    this.setRotation(rotation);
  }

  protected buildCapability(): RotateCapability {
    return {
      onRotateChange: this.rotate$.on,
      setRotation: (rotation) => this.setRotation(rotation),
      getRotation: () => this.coreState.core.rotation,
      rotateForward: () => this.rotateForward(),
      rotateBackward: () => this.rotateBackward(),
    };
  }

  public getMatrixAsString(options: GetMatrixOptions = { w: 0, h: 0 }): string {
    return getRotationMatrixString(this.coreState.core.rotation, options.w, options.h);
  }

  async destroy(): Promise<void> {
    this.rotate$.clear();
    super.destroy();
  }
}
