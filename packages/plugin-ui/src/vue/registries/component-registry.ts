import { ref, inject, provide, type Component, type InjectionKey, type Ref } from 'vue';
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

const ComponentRegistryKey: InjectionKey<ComponentRegistry> = Symbol('ComponentRegistry');

export function createComponentRegistry(
  initialComponents: Record<string, Component<BaseComponentProps>> = {},
): ComponentRegistry {
  const components: Ref<Map<string, Component<BaseComponentProps>>> = ref(
    new Map(Object.entries(initialComponents)),
  );

  return {
    register(id: string, component: Component<BaseComponentProps>) {
      components.value.set(id, component);
    },

    unregister(id: string) {
      components.value.delete(id);
    },

    get(id: string) {
      return components.value.get(id);
    },

    has(id: string) {
      return components.value.has(id);
    },

    getRegisteredIds() {
      return Array.from(components.value.keys());
    },
  };
}

export function provideComponentRegistry(
  initialComponents: Record<string, Component<BaseComponentProps>> = {},
) {
  const registry = createComponentRegistry(initialComponents);
  provide(ComponentRegistryKey, registry);
  return registry;
}

export function useComponentRegistry(): ComponentRegistry {
  const registry = inject(ComponentRegistryKey);
  if (!registry) {
    throw new Error('useComponentRegistry must be used within UIProvider');
  }
  return registry;
}
