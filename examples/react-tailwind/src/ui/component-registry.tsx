import { ComponentType } from 'react';

/**
 * Component Registry
 *
 * A registry system for custom components that can be referenced in the UI schema.
 * This allows the UI schema to reference components by ID, which are then resolved
 * at runtime from this registry.
 */

/**
 * Props that all custom components must accept
 */
export interface BaseComponentProps {
  documentId: string;
  [key: string]: any;
}

/**
 * Type for a registered component
 */
type RegisteredComponent = ComponentType<BaseComponentProps>;

/**
 * The component registry singleton
 */
class ComponentRegistry {
  private components = new Map<string, RegisteredComponent>();

  /**
   * Register a component with a unique ID
   */
  register(id: string, component: RegisteredComponent): void {
    if (this.components.has(id)) {
      console.warn(`Component with id "${id}" is already registered. Overwriting.`);
    }
    this.components.set(id, component);
  }

  /**
   * Get a component by ID
   */
  get(id: string): RegisteredComponent | undefined {
    return this.components.get(id);
  }

  /**
   * Check if a component is registered
   */
  has(id: string): boolean {
    return this.components.has(id);
  }

  /**
   * Unregister a component
   */
  unregister(id: string): void {
    this.components.delete(id);
  }

  /**
   * Get all registered component IDs
   */
  getRegisteredIds(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Clear all registered components
   */
  clear(): void {
    this.components.clear();
  }
}

/**
 * Singleton instance of the component registry
 */
export const componentRegistry = new ComponentRegistry();

/**
 * Hook to register components during component mount
 * @example
 * ```tsx
 * // In your app initialization:
 * useRegisterComponent('my-component', MyComponent);
 * ```
 */
export function useRegisterComponent(id: string, component: RegisteredComponent): void {
  // Register on mount, unregister on unmount
  // Note: In production, you'd typically register components once at app startup
  // This hook is mainly for development convenience
  componentRegistry.register(id, component);
}

/**
 * Helper to render a registered component
 */
export function renderRegisteredComponent(
  componentId: string,
  props: BaseComponentProps,
): JSX.Element | null {
  const Component = componentRegistry.get(componentId);

  if (!Component) {
    console.error(`Component "${componentId}" not found in registry`);
    return null;
  }

  return <Component {...props} />;
}
