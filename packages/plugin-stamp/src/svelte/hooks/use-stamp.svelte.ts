import { useCapability, usePlugin } from '@embedpdf/core/svelte';
import { StampPlugin } from '@embedpdf/plugin-stamp';
import type { ResolvedStamp, StampLibrary, ActiveStampInfo } from '@embedpdf/plugin-stamp';

export const useStampPlugin = () => usePlugin<StampPlugin>(StampPlugin.id);
export const useStampCapability = () => useCapability<StampPlugin>(StampPlugin.id);

export function useStampLibraries() {
  const capability = useStampCapability();
  let libraries = $state<StampLibrary[]>([]);

  $effect(() => {
    if (!capability.provides) {
      libraries = [];
      return;
    }

    libraries = capability.provides.getLibraries();
    return capability.provides.onLibraryChange((libs) => {
      libraries = libs;
    });
  });

  return {
    get libraries() {
      return libraries;
    },
  };
}

export function useStampsByCategory(getCategory: () => string) {
  const capability = useStampCapability();
  let stamps = $state<ResolvedStamp[]>([]);
  const category = $derived(getCategory());

  $effect(() => {
    if (!capability.provides) {
      stamps = [];
      return;
    }

    stamps = capability.provides.getStampsByCategory(category);
    return capability.provides.onLibraryChange(() => {
      stamps = capability.provides!.getStampsByCategory(category);
    });
  });

  return {
    get stamps() {
      return stamps;
    },
  };
}

export function useStampsByLibrary(
  getLibraryId: () => string | undefined,
  getCategory?: () => string | undefined,
) {
  const capability = useStampCapability();
  let stamps = $state<ResolvedStamp[]>([]);
  const libraryId = $derived(getLibraryId());
  const category = $derived(getCategory?.());

  $effect(() => {
    if (!capability.provides) {
      stamps = [];
      return;
    }

    const derive = () => {
      const libraries = capability.provides!.getLibraries();
      const results: ResolvedStamp[] = [];

      for (const library of libraries) {
        if (libraryId && libraryId !== 'all' && library.id !== libraryId) continue;

        for (const stamp of library.stamps) {
          if (category) {
            const libraryMatches = library.categories?.includes(category) ?? false;
            const stampMatches = stamp.categories?.includes(category) ?? false;
            if (!libraryMatches && !stampMatches) continue;
          }
          results.push({ library, stamp });
        }
      }

      stamps = results;
    };

    derive();
    return capability.provides.onLibraryChange(derive);
  });

  return {
    get stamps() {
      return stamps;
    },
  };
}

export function useActiveStamp(getDocumentId: () => string) {
  const capability = useStampCapability();
  let activeStamp = $state<ActiveStampInfo | null>(null);
  const documentId = $derived(getDocumentId());

  $effect(() => {
    if (!capability.provides || !documentId) {
      activeStamp = null;
      return;
    }

    const scope = capability.provides.forDocument(documentId);
    activeStamp = scope.getActiveStamp();
    return scope.onActiveStampChange((stamp) => {
      activeStamp = stamp;
    });
  });

  return {
    get activeStamp() {
      return activeStamp;
    },
  };
}
