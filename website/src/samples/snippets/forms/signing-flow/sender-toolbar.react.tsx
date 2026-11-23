import { useForm, useFormState } from '@embedpdf/react/form';
import { useInteraction, useInteractionState } from '@embedpdf/react/interaction';

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-signature', 'Signature'],
] as const;

export function SenderToolbar() {
  const form = useForm();
  const { groups, designGroup } = useFormState();
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return (
    <>
      {groups.map((group) => (
        <button
          key={group.id}
          aria-pressed={designGroup === group.id}
          disabled={!form.canSetGroup(group.id)}
          onClick={() => form.setDesignGroup(group.id)}
        >
          <i style={{ background: group.color }} /> {group.label ?? group.id}
        </button>
      ))}

      {FIELD_TOOLS.map(([id, label]) => (
        <button
          key={id}
          aria-pressed={activeToolId === id}
          onClick={() => interaction.activateTool(id)}
        >
          {label}
        </button>
      ))}
    </>
  );
}
