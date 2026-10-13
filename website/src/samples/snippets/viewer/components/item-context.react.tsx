import { useToolbarItem } from '@embedpdf/viewer-react';

export function Reviewers({ people }: { people: { id: string; name: string; avatar: string }[] }) {
  const { orientation } = useToolbarItem(); // 'horizontal' or 'vertical'
  return (
    <div className={`reviewers ${orientation}`}>
      {people.map((person) => (
        <img key={person.id} src={person.avatar} alt={person.name} title={person.name} />
      ))}
    </div>
  );
}
