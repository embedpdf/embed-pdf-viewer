import { UI_ATTRIBUTES, UI_SELECTORS } from '@embedpdf/plugin-ui';
import { useUICapability, useUIPlugin } from './hooks/use-ui';
import { UIContainerContext, UIContainerContextValue } from './hooks/use-ui-container';
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  ReactNode,
  HTMLAttributes,
} from '@framework';

/**
 * Find the style injection target for an element.
 * Returns the shadow root if inside one, otherwise document.head.
 */
function getStyleTarget(element: HTMLElement): HTMLElement | ShadowRoot {
  const root = element.getRootNode();
  if (root instanceof ShadowRoot) {
    return root;
  }
  return document.head;
}

interface UIRootProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Internal component that handles:
 * 1. Injecting the generated stylesheet (into shadow root or document.head)
 * 2. Managing the data-disabled-categories attribute
 * 3. Updating styles on locale changes
 */
export function UIRoot({ children, style, ...restProps }: UIRootProps) {
  const { plugin } = useUIPlugin();
  const { provides } = useUICapability();
  const [disabledCategories, setDisabledCategories] = useState<string[]>([]);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const styleTargetRef = useRef<HTMLElement | ShadowRoot | null>(null);
  const previousElementRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Create container context value (memoized to prevent unnecessary re-renders)
  const containerContextValue = useMemo<UIContainerContextValue>(
    () => ({
      containerRef,
      getContainer: () => containerRef.current,
    }),
    [],
  );

  // Callback ref that handles style injection when element mounts
  // Handles React Strict Mode by tracking previous element
  const rootRefCallback = useCallback(
    (element: HTMLDivElement | null) => {
      const previousElement = previousElementRef.current;

      // Update refs
      previousElementRef.current = element;
      (containerRef as any).current = element;

      // If element is null (unmount), don't do anything yet
      // React Strict Mode will remount, so we'll handle cleanup in useEffect
      if (!element) {
        return;
      }

      // If element changed (or is new) and plugin is available, inject styles
      if (element !== previousElement && plugin) {
        const styleTarget = getStyleTarget(element);
        styleTargetRef.current = styleTarget;

        // Check if styles already exist in this target
        const existingStyle = styleTarget.querySelector(
          UI_SELECTORS.STYLES,
        ) as HTMLStyleElement | null;

        if (existingStyle) {
          styleElRef.current = existingStyle;
          // Update content in case locale changed
          existingStyle.textContent = plugin.getStylesheet();
          return;
        }

        // Create and inject stylesheet
        const stylesheet = plugin.getStylesheet();
        const styleEl = document.createElement('style');
        styleEl.setAttribute(UI_ATTRIBUTES.STYLES, '');
        styleEl.textContent = stylesheet;

        if (styleTarget instanceof ShadowRoot) {
          // For shadow root, prepend before other content
          styleTarget.insertBefore(styleEl, styleTarget.firstChild);
        } else {
          styleTarget.appendChild(styleEl);
        }

        styleElRef.current = styleEl;
      }
    },
    [plugin],
  );

  // Cleanup on actual unmount (not Strict Mode remount)
  useEffect(() => {
    return () => {
      // Only cleanup if we're actually unmounting (not just Strict Mode)
      // The style element will be reused if component remounts
      if (styleElRef.current?.parentNode && !previousElementRef.current) {
        styleElRef.current.remove();
      }
      styleElRef.current = null;
      styleTargetRef.current = null;
    };
  }, []);

  // Subscribe to stylesheet invalidation (locale changes, schema merges)
  useEffect(() => {
    if (!plugin) return;

    return plugin.onStylesheetInvalidated(() => {
      // Update the style element content
      if (styleElRef.current) {
        styleElRef.current.textContent = plugin.getStylesheet();
      }
    });
  }, [plugin]);

  // Subscribe to category and hidden items changes
  useEffect(() => {
    if (!provides) return;

    setDisabledCategories(provides.getDisabledCategories());
    setHiddenItems(provides.getHiddenItems());

    return provides.onCategoryChanged(({ disabledCategories, hiddenItems }) => {
      setDisabledCategories(disabledCategories);
      setHiddenItems(hiddenItems);
    });
  }, [provides]);

  // Build the disabled categories attribute value
  const disabledCategoriesAttr = useMemo(
    () => (disabledCategories.length > 0 ? disabledCategories.join(' ') : undefined),
    [disabledCategories],
  );

  // Build the hidden items attribute value
  const hiddenItemsAttr = useMemo(
    () => (hiddenItems.length > 0 ? hiddenItems.join(' ') : undefined),
    [hiddenItems],
  );

  const combinedStyle = useMemo(() => {
    const base = { containerType: 'inline-size' as const };
    if (style && typeof style === 'object') {
      return { ...base, ...style };
    }
    return base;
  }, [style]);

  const rootProps = {
    [UI_ATTRIBUTES.ROOT]: '',
    [UI_ATTRIBUTES.DISABLED_CATEGORIES]: disabledCategoriesAttr,
    [UI_ATTRIBUTES.HIDDEN_ITEMS]: hiddenItemsAttr,
  };

  return (
    <UIContainerContext.Provider value={containerContextValue}>
      <div ref={rootRefCallback} {...rootProps} {...restProps} style={combinedStyle}>
        {children}
      </div>
    </UIContainerContext.Provider>
  );
}
