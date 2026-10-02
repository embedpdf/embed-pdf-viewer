import { actionsPlugin } from '@embedpdf/vue/actions';
import { formPlugin } from '@embedpdf/vue/form';

export const plugins = [/* … */ formPlugin(), actionsPlugin({ javascript: { enabled: true } })];
