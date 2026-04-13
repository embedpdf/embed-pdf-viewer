import { useCapability, usePlugin } from '@embedpdf/core/vue';
import { StampPlugin, StampLibrary, ResolvedStamp, ActiveStampInfo } from '@embedpdf/plugin-stamp';
import { ref, watch, toValue, type MaybeRefOrGetter } from 'vue';

export const useStampPlugin = () => usePlugin<StampPlugin>(StampPlugin.id);
export const useStampCapability = () => useCapability<StampPlugin>(StampPlugin.id);

export const useStampLibraries = () => {
  const { provides } = useStampCapability();
  const libraries = ref<StampLibrary[]>([]);

  watch(
    provides,
    (capability, _, onCleanup) => {
      if (!capability) {
        libraries.value = [];
        return;
      }

      libraries.value = capability.getLibraries();
      const unsubscribe = capability.onLibraryChange((libs) => {
        libraries.value = libs;
      });
      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return { libraries };
};

export const useStampsByCategory = (category: MaybeRefOrGetter<string>) => {
  const { provides } = useStampCapability();
  const stamps = ref<ResolvedStamp[]>([]);

  watch(
    [provides, () => toValue(category)],
    ([capability, cat], _, onCleanup) => {
      if (!capability) {
        stamps.value = [];
        return;
      }

      stamps.value = capability.getStampsByCategory(cat);
      const unsubscribe = capability.onLibraryChange(() => {
        stamps.value = capability.getStampsByCategory(cat);
      });
      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return stamps;
};

export const useStampsByLibrary = (
  libraryId: MaybeRefOrGetter<string | undefined>,
  category?: MaybeRefOrGetter<string | undefined>,
) => {
  const { provides } = useStampCapability();
  const stamps = ref<ResolvedStamp[]>([]);

  watch(
    [provides, () => toValue(libraryId), () => toValue(category)],
    ([capability, libId, cat], _, onCleanup) => {
      if (!capability) {
        stamps.value = [];
        return;
      }

      const derive = () => {
        const libraries = capability.getLibraries();
        const results: ResolvedStamp[] = [];

        for (const library of libraries) {
          if (libId && libId !== 'all' && library.id !== libId) continue;

          for (const stamp of library.stamps) {
            if (cat) {
              const libraryMatches = library.categories?.includes(cat) ?? false;
              const stampMatches = stamp.categories?.includes(cat) ?? false;
              if (!libraryMatches && !stampMatches) continue;
            }
            results.push({ library, stamp });
          }
        }

        stamps.value = results;
      };

      derive();
      const unsubscribe = capability.onLibraryChange(derive);
      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return stamps;
};

export const useActiveStamp = (documentId: MaybeRefOrGetter<string>) => {
  const { provides } = useStampCapability();
  const activeStamp = ref<ActiveStampInfo | null>(null);

  watch(
    [provides, () => toValue(documentId)],
    ([capability, docId], _, onCleanup) => {
      if (!capability || !docId) {
        activeStamp.value = null;
        return;
      }

      const scope = capability.forDocument(docId);
      activeStamp.value = scope.getActiveStamp();
      const unsubscribe = scope.onActiveStampChange((stamp) => {
        activeStamp.value = stamp;
      });
      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return activeStamp;
};
