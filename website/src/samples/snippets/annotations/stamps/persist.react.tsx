import { useEffect } from 'react';
import {
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
  useStamp,
  useStampLibraries,
} from '@embedpdf/react/stamp';

const store = indexedDbByteStore('stamps');

export function StampLibraries() {
  const stamp = useStamp();
  const libraries = useStampLibraries();

  useEffect(() => {
    void restoreStampLibraries(stamp, store); // import every stored library
    return persistStampLibraries(stamp, store, { except: ['embedpdf-standard'] });
  }, [stamp]);

  return (
    <ul>
      {libraries.map((library) => (
        <li key={library.id}>{library.name}</li>
      ))}
    </ul>
  );
}
