import { useComponentRegistry } from '../registries/component-registry';

/**
 * Helper utilities for building renderers
 */
export function useItemRenderer() {
  const componentRegistry = useComponentRegistry();

  return {
    /**
     * Render a custom component by ID
     *
     * @param componentId - Component ID from schema
     * @param documentId - Document ID
     * @param props - Additional props to pass to component
     * @returns Rendered component or null if not found
     */
    renderCustomComponent: (componentId: string, documentId: string, props?: any) => {
      const Component = componentRegistry.get(componentId);

      if (!Component) {
        console.error(`Component "${componentId}" not found in registry`);
        return null;
      }

      return <Component documentId={documentId} {...(props || {})} />;
    },
  };
}
