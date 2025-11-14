import { PluginRegistry } from '../registry/plugin-registry';
import { Logger, PdfEngine, Rotation } from '@embedpdf/models';
import { Action, Reducer } from '../store/types';
import { CoreState } from '../store';

export interface IPlugin<TConfig = unknown> {
  id: string;

  initialize?(config: TConfig): Promise<void>;
  destroy?(): Promise<void> | void;
  provides?(): any;
  postInitialize?(): Promise<void>;
  ready?(): Promise<void>;
}

export interface BasePluginConfig {
  enabled?: boolean;
}

export interface PluginRegistryConfig {
  defaultRotation?: Rotation;
  defaultScale?: number;
  logger?: Logger;
}

export interface PluginManifest<TConfig = unknown> {
  id: string;
  name: string;
  version: string;
  provides: string[]; // Capabilities this plugin provides
  requires: string[]; // Mandatory capabilities
  optional: string[]; // Optional capabilities
  defaultConfig: TConfig; // Default configuration
  metadata?: {
    description?: string;
    author?: string;
    homepage?: string;
    [key: string]: unknown;
  };
}

export interface PluginPackage<
  T extends IPlugin<TConfig>,
  TConfig = unknown,
  TState = unknown,
  TAction extends Action = Action,
> {
  manifest: PluginManifest<TConfig>;
  create(registry: PluginRegistry, config: TConfig): T;
  reducer: Reducer<TState, TAction>;
  initialState: TState | ((coreState: CoreState, config: TConfig) => TState);
}

export type Component = any;

// Use semantic names that describe PURPOSE, not implementation
export type StandaloneComponent = Component; // Doesn't wrap content
export type ContainerComponent = Component; // Wraps/contains content

export type AutoMountElement =
  | {
      component: StandaloneComponent;
      type: 'utility';
    }
  | {
      component: ContainerComponent;
      type: 'wrapper';
    };

export type WithAutoMount<T extends PluginPackage<any, any, any, any>> = T & {
  /**
   * Returns an array of components/elements with their mount type.
   * - 'utility': Mounted as hidden DOM elements (file pickers, download anchors)
   * - 'wrapper': Wraps the viewer content (fullscreen providers, theme providers)
   */
  autoMountElements: () => AutoMountElement[];
};

export function hasAutoMountElements<T extends PluginPackage<any, any, any, any>>(
  pkg: T,
): pkg is WithAutoMount<T> {
  return 'autoMountElements' in pkg && typeof pkg.autoMountElements === 'function';
}

export type PluginStatus =
  | 'registered' // Plugin is registered but not initialized
  | 'active' // Plugin is initialized and running
  | 'error' // Plugin encountered an error
  | 'disabled' // Plugin is temporarily disabled
  | 'unregistered'; // Plugin is being unregistered

export interface PluginBatchRegistration<
  T extends IPlugin<TConfig>,
  TConfig = unknown,
  TState = unknown,
  TAction extends Action = Action,
> {
  package: PluginPackage<T, TConfig, TState, TAction>;
  config?: Partial<TConfig>;
}

export type PluginBatchRegistrations = PluginBatchRegistration<IPlugin<any>, any>[];

export interface GlobalStoreState<TPlugins extends Record<string, any> = {}> {
  core: CoreState;
  plugins: TPlugins;
}
