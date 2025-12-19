---
'@embedpdf/plugin-scroll': minor
---

## Remove `initialPage` Config & Add `isInitial` to `LayoutReadyEvent`

### Breaking Changes

- **Removed `initialPage` config option**: The `initialPage` configuration option has been removed from `ScrollPluginConfig`. With multi-document support, a global initial page setting no longer makes sense.

### Migration

To scroll to a specific page when a document loads, use the `onLayoutReady` event instead:

```tsx
import { useCapability } from '@embedpdf/core/react';
import type { ScrollPlugin } from '@embedpdf/plugin-scroll';

const ScrollToPageOnLoad = ({ documentId, initialPage }) => {
  const { provides: scrollCapability } = useCapability<ScrollPlugin>('scroll');

  useEffect(() => {
    if (!scrollCapability) return;

    const unsubscribe = scrollCapability.onLayoutReady((event) => {
      if (event.documentId === documentId && event.isInitial) {
        scrollCapability.forDocument(documentId).scrollToPage({
          pageNumber: initialPage,
          behavior: 'instant',
        });
      }
    });

    return unsubscribe;
  }, [scrollCapability, documentId, initialPage]);

  return null;
};
```

### New Features

- **`isInitial` flag on `LayoutReadyEvent`**: The `onLayoutReady` event now includes an `isInitial` boolean that is `true` only on the first layout after document load, and `false` on subsequent layouts (e.g., when switching between tabs). This allows distinguishing between initial document load and tab reactivation.
