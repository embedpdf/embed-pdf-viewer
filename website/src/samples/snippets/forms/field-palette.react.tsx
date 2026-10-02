import { useInteraction, useInteractionState } from '@embedpdf/react/interaction';

const FIELD_TOOLS = [
  ['form-text', 'Text'],
  ['form-checkbox', 'Checkbox'],
  ['form-radio', 'Radio button'],
  ['form-combobox', 'Dropdown'],
  ['form-listbox', 'List'],
  ['form-signature', 'Signature'],
] as const;

export function FieldPalette() {
  const interaction = useInteraction();
  const { activeToolId } = useInteractionState();

  return FIELD_TOOLS.map(([id, label]) => (
    <button key={id} aria-pressed={activeToolId === id} onClick={() => interaction.activateTool(id)}>
      {label}
    </button>
  ));
}
