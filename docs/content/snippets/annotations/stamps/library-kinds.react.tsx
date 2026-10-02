import { useStampLibraries } from '@embedpdf/react/stamp';

export function LibraryList() {
  const libraries = useStampLibraries({ kind: ['stamps', 'legal-seals'] });

  return (
    <ul>
      {libraries.map((library) => (
        <li key={library.id}>{library.name}</li>
      ))}
    </ul>
  );
}
