import { ResponsiveItemMetadata, ResponsiveVisibilityRule } from '@embedpdf/plugin-ui';

/**
 * Tailwind breakpoint mapping
 * Customize these to match your tailwind.config.js
 *
 * NOTE: Keep the strings as string literals so Tailwind's scanner picks them up.
 */
const TAILWIND_VISIBILITY_CLASSES = {
  sm: {
    show: 'sm:flex',
    hide: 'sm:hidden',
  },
  md: {
    show: 'md:flex',
    hide: 'md:hidden',
  },
  lg: {
    show: 'lg:flex',
    hide: 'lg:hidden',
  },
  xl: {
    show: 'xl:flex',
    hide: 'xl:hidden',
  },
  '2xl': {
    show: '2xl:flex',
    hide: '2xl:hidden',
  },
} as const;

/**
 * Maps custom breakpoint IDs to Tailwind prefixes
 * e.g., { minWidth: 768 } -> 'md'
 */
function mapBreakpointToTailwind(rule: ResponsiveVisibilityRule): string | null {
  // Use minWidth if available, otherwise use maxWidth
  const width = rule.minWidth ?? rule.maxWidth;
  if (!width) return null;

  // Map your custom breakpoints to Tailwind
  // Tailwind breakpoints: sm=640px, md=768px, lg=1024px, xl=1280px, 2xl=1536px
  if (width >= 1536) return '2xl';
  if (width >= 1280) return 'xl';
  if (width >= 1024) return 'lg';
  if (width >= 768) return 'md';
  if (width >= 640) return 'sm';

  return null;
}

/**
 * Converts responsive metadata into Tailwind CSS classes
 */
export function resolveResponsiveClasses(metadata: ResponsiveItemMetadata | null): string {
  if (!metadata || metadata.visibilityRules.length === 0) {
    return '';
  }

  const classes: string[] = [];

  // Set base visibility
  if (!metadata.defaultVisible) {
    classes.push('hidden');
  }

  // Add breakpoint-specific classes
  // Only process minWidth rules to avoid conflicts (Tailwind is mobile-first)
  metadata.visibilityRules
    .filter((rule) => rule.minWidth !== undefined)
    .forEach((rule) => {
      const prefix = mapBreakpointToTailwind(rule);
      if (!prefix) return;
      const visibilityClasses =
        TAILWIND_VISIBILITY_CLASSES[prefix as keyof typeof TAILWIND_VISIBILITY_CLASSES];
      if (!visibilityClasses) return;

      if (rule.visible) {
        classes.push(visibilityClasses.show);
      } else {
        classes.push(visibilityClasses.hide);
      }
    });

  return classes.join(' ');
}

/**
 * Hook to get responsive classes for an item in a toolbar
 */
export function useResponsiveClasses(metadata: ResponsiveItemMetadata | null): string {
  return resolveResponsiveClasses(metadata);
}
