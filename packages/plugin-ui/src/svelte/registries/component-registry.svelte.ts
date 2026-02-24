import { getContext, setContext, type Component } from 'svelte';
import type { BaseComponentProps } from '../types';

/**
 * Component Registry
 *
 * Stores custom components that can be referenced in the UI schema.
 */
export interface ComponentRegistry {
  register(id: string, component: Component<BaseComponentProps>): void;
  unregister(id: string): void;
  get(id: string): Component<BaseComponentProps> | undefined;
  has(id: string): boolean;
  getRegisteredIds(): string[];
}

const COMPONENT_REGISTRY_KEY = Symbol('ComponentRegistry');

export function createComponentRegistry(
  initialComponents: Record<string, Component<BaseComponentProps>> = {},
): ComponentRegistry {
  const components = new Map<string, Component<BaseComponentProps>>(
    Object.entries(initialComponents),
  );

  return {
    register(id: string, component: Component<BaseComponentProps>) {
      components.set(id, component);
    },

    unregister(id: string) {
      components.delete(id);
    },

    get(id: string) {
      return components.get(id);
    },

    has(id: string) {
      return components.has(id);
    },

    getRegisteredIds() {
      return Array.from(components.keys());
    },
  };
}

export function provideComponentRegistry(
  initialComponents: Record<string, Component<BaseComponentProps>> = {},
) {
  const registry = createComponentRegistry(initialComponents);
  setContext(COMPONENT_REGISTRY_KEY, registry);
  return registry;
}

export function useComponentRegistry(): ComponentRegistry {
  const registry = getContext<ComponentRegistry>(COMPONENT_REGISTRY_KEY);
  if (!registry) {
    throw new Error('useComponentRegistry must be used within UIProvider');
  }
  return registry;
}
