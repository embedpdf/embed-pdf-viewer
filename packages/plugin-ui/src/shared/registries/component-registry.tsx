import { createContext, useContext, useRef, useCallback } from '@framework';
import type { ComponentType, ReactNode } from '@framework';
import { BaseComponentProps } from '../types';

/**
 * Component Registry
 *
 * Stores custom components that can be referenced in the UI schema.
 */
export interface ComponentRegistry {
  register(id: string, component: ComponentType<BaseComponentProps>): void;
  unregister(id: string): void;
  get(id: string): ComponentType<BaseComponentProps> | undefined;
  has(id: string): boolean;
  getRegisteredIds(): string[];
}

const ComponentRegistryContext = createContext<ComponentRegistry | null>(null);

export interface ComponentRegistryProviderProps {
  children: ReactNode;
  initialComponents?: Record<string, ComponentType<BaseComponentProps>>;
}

export function ComponentRegistryProvider({
  children,
  initialComponents = {},
}: ComponentRegistryProviderProps) {
  const componentsRef = useRef<Map<string, ComponentType<BaseComponentProps>>>(
    new Map(Object.entries(initialComponents)),
  );

  const registry: ComponentRegistry = {
    register: useCallback((id: string, component: ComponentType<BaseComponentProps>) => {
      componentsRef.current.set(id, component);
    }, []),

    unregister: useCallback((id: string) => {
      componentsRef.current.delete(id);
    }, []),

    get: useCallback((id: string) => {
      return componentsRef.current.get(id);
    }, []),

    has: useCallback((id: string) => {
      return componentsRef.current.has(id);
    }, []),

    getRegisteredIds: useCallback(() => {
      return Array.from(componentsRef.current.keys());
    }, []),
  };

  return (
    <ComponentRegistryContext.Provider value={registry}>
      {children}
    </ComponentRegistryContext.Provider>
  );
}

export function useComponentRegistry(): ComponentRegistry {
  const context = useContext(ComponentRegistryContext);
  if (!context) {
    throw new Error('useComponentRegistry must be used within UIProvider');
  }
  return context;
}
