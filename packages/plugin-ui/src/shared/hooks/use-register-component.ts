import { useEffect } from '@framework';
import type { ComponentType } from '@framework';
import { useComponentRegistry } from '../registries/component-registry';
import { BaseComponentProps } from '../types';

/**
 * Register a custom component for use in UI schema
 *
 * @param id - Component ID (referenced in schema)
 * @param component - Component to register
 *
 * @example
 * ```tsx
 * function ComponentRegistration() {
 *   useRegisterComponent('thumbnail-panel', ThumbnailPanel);
 *   useRegisterComponent('bookmark-panel', BookmarkPanel);
 *   return null;
 * }
 * ```
 */
export function useRegisterComponent(
  id: string,
  component: ComponentType<BaseComponentProps>,
): void {
  const registry = useComponentRegistry();

  useEffect(() => {
    registry.register(id, component);

    return () => {
      registry.unregister(id);
    };
  }, [registry, id, component]);
}
