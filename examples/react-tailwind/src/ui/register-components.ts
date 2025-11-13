/**
 * Component Registration
 *
 * This module registers all custom components that can be referenced
 * in the UI schema. Components must be registered before the UI schema
 * is used.
 */

import { componentRegistry } from './component-registry';
import { CustomZoomToolbar } from '../components/custom-zoom-toolbar';
import { ThumbnailsSidebar } from '../components/thumbnails-sidebar';
import { SearchSidebar } from '../components/search-sidebar';
import { OutlineSidebar } from '../components/outline-sidebar';

/**
 * Register all custom components
 *
 * This function should be called once at application startup
 * before rendering any schema-driven UI.
 */
export function registerAllComponents(): void {
  // Register custom toolbar components
  componentRegistry.register('zoom-toolbar', CustomZoomToolbar);

  // Register panel/sidebar components
  componentRegistry.register('thumbnails-sidebar', ThumbnailsSidebar);
  componentRegistry.register('search-sidebar', SearchSidebar);
  componentRegistry.register('outline-sidebar', OutlineSidebar);

  // Add more component registrations here as needed
  // Example:
  // componentRegistry.register('my-custom-component', MyCustomComponent);
}

/**
 * Unregister all components (useful for cleanup in tests)
 */
export function unregisterAllComponents(): void {
  componentRegistry.clear();
}
