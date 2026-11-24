import { useForm, useFormState } from '@embedpdf/react/form';

export function GiveSelectedTo() {
  const form = useForm();
  const { groups, selectedFields } = useFormState();

  if (selectedFields.length === 0) return null;
  const refs = selectedFields.map((field) => field.ref);

  return (
    <>
      Give to
      {groups.map((group) => (
        <button
          key={group.id}
          disabled={!form.canSetGroup(group.id)}
          onClick={() => void form.moveToGroup(refs, group.id)}
        >
          <i style={{ background: group.color }} /> {group.label ?? group.id}
        </button>
      ))}
    </>
  );
}
