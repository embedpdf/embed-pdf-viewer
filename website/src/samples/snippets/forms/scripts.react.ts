import { actionsPlugin } from '@embedpdf/react/actions';
import { formPlugin } from '@embedpdf/react/form';

export const plugins = [/* … */ formPlugin(), actionsPlugin({ javascript: { enabled: true } })];
