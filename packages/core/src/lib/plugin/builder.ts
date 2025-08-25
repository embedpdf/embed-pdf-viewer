import {
  PluginPackage,
  WithAutoMount,
  AutoMountElement,
  StandaloneComponent,
  ContainerComponent,
  IPlugin,
} from '../types/plugin';
import { Action } from '../store/types';

export class PluginPackageBuilder<
  T extends IPlugin<TConfig>,
  TConfig = unknown,
  TState = unknown,
  TAction extends Action = Action,
> {
  private package: PluginPackage<T, TConfig, TState, TAction>;
  private autoMountElements: AutoMountElement[] = [];

  constructor(basePackage: PluginPackage<T, TConfig, TState, TAction>) {
    this.package = basePackage;
  }

  addUtility(component: StandaloneComponent): this {
    this.autoMountElements.push({ component, type: 'utility' });
    return this;
  }

  addWrapper(component: ContainerComponent): this {
    this.autoMountElements.push({ component, type: 'wrapper' });
    return this;
  }

  build(): WithAutoMount<PluginPackage<T, TConfig, TState, TAction>> {
    return {
      ...this.package,
      autoMountElements: () => this.autoMountElements,
    };
  }
}

// Helper function for cleaner API
export function createPluginPackage<
  T extends IPlugin<TConfig>,
  TConfig = unknown,
  TState = unknown,
  TAction extends Action = Action,
>(basePackage: PluginPackage<T, TConfig, TState, TAction>) {
  return new PluginPackageBuilder(basePackage);
}
