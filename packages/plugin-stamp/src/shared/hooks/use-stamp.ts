import { useCapability, usePlugin } from '@embedpdf/core/@framework';
import { StampPlugin, StampLibrary, ResolvedStamp, ActiveStampInfo } from '@embedpdf/plugin-stamp';
import { useState, useEffect } from '@framework';

export const useStampPlugin = () => usePlugin<StampPlugin>(StampPlugin.id);
export const useStampCapability = () => useCapability<StampPlugin>(StampPlugin.id);

export const useStampLibraries = () => {
  const { provides } = useStampCapability();
  const [libraries, setLibraries] = useState<StampLibrary[]>(provides?.getLibraries() ?? []);

  useEffect(() => {
    if (!provides) return;
    setLibraries(provides.getLibraries());
    return provides.onLibraryChange((libs) => {
      setLibraries(libs);
    });
  }, [provides]);

  return { libraries, provides };
};

export const useStampsByCategory = (category: string) => {
  const { provides } = useStampCapability();
  const [stamps, setStamps] = useState<ResolvedStamp[]>([]);

  useEffect(() => {
    if (!provides) return;
    setStamps(provides.getStampsByCategory(category));
    return provides.onLibraryChange(() => {
      setStamps(provides.getStampsByCategory(category));
    });
  }, [provides, category]);

  return stamps;
};

export const useStampsByLibrary = (libraryId?: string, category?: string) => {
  const { provides } = useStampCapability();
  const [stamps, setStamps] = useState<ResolvedStamp[]>([]);

  useEffect(() => {
    if (!provides) return;

    const derive = () => {
      const libraries = provides.getLibraries();
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

      setStamps(results);
    };

    derive();
    return provides.onLibraryChange(derive);
  }, [provides, libraryId, category]);

  return stamps;
};

export const useActiveStamp = (documentId: string) => {
  const { provides: stamp } = useStampCapability();
  const [activeStamp, setActiveStamp] = useState<ActiveStampInfo | null>(null);

  useEffect(() => {
    if (!stamp) return;
    const scope = stamp.forDocument(documentId);
    setActiveStamp(scope.getActiveStamp());
    return scope.onActiveStampChange(setActiveStamp);
  }, [stamp, documentId]);

  return activeStamp;
};
