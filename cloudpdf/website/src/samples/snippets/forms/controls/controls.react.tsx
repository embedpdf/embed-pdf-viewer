import { FormLayer, type FieldControl } from '@embedpdf/react/form';
import { Switch } from './switch';

const controls: FieldControl[] = [
  { for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox', component: Switch },
];

export const Fields = () => <FormLayer controls={controls} />;
