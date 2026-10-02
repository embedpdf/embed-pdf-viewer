<!--
  A checkbox or a radio button: the field's picture is the control, so the box itself takes the
  role, the tab stop and the keys. A click, Space or Enter writes the toggled value, then runs
  the widget's action (Acrobat's order: `@embedpdf/web`'s `pressToggle`).
-->
<script lang="ts">
  import type { FormWidgetItem } from '@embedpdf/plugin-form';
  // The value write and the activation go through the host lens, like the rest of the layer.
  import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
  import { pressToggle } from '@embedpdf/web';
  import type { FormColors } from '@embedpdf/web';
  import { useCapability } from '../runtime/readers.svelte';
  import FormFocusRing from './FormFocusRing.svelte';
  import { useWidgetActivation } from './widget';
  import WidgetBox from './WidgetBox.svelte';

  let {
    item,
    colors,
  }: { item: Extract<FormWidgetItem, { control: 'toggle' }>; colors: FormColors } = $props();

  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(() => item.annotationRef);
  let focused = $state(false);

  // The value first, then the widget's action.
  const press = () => pressToggle(form, item, activate);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    press();
  }
</script>

<WidgetBox
  {item}
  {colors}
  role={item.kind === 'checkbox' ? 'checkbox' : 'radio'}
  aria-checked={item.checked}
  aria-label={item.label}
  tabindex={item.disabled ? -1 : 0}
  onclick={press}
  onkeydown={onKeyDown}
  onfocus={() => (focused = true)}
  onblur={() => (focused = false)}
  style="cursor: {item.disabled ? 'default' : 'pointer'}; outline: none"
>
  <FormFocusRing visible={focused} color={colors.focus} />
</WidgetBox>
