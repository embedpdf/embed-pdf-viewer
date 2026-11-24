/**
 * The layer's own control for one box, by the box's control:
 *
 *   text   → the picture at rest; focus shows an editor in the field's font.
 *   toggle → the picture is the control; a click writes the toggled value.
 *   combo  → an invisible native <select> over the picture.
 *   list   → a visible native <select>: one surface owns the rows, the
 *            keyboard and the scrolling.
 *   button → a native click target over the picture that runs its action.
 *   signature → "sign here", or the signed field's details, with the
 *            signature plugin.
 *
 * A function, not a component around the control: `<component :is>` draws
 * the control itself, so a box costs one component, as it does to mount and
 * to update.
 */
import type { Component } from 'vue';
import type { FormWidgetItem } from '@embedpdf/plugin-form';
import ButtonControl from './ButtonControl.vue';
import ComboControl from './ComboControl.vue';
import ListControl from './ListControl.vue';
import SignatureControl from './SignatureControl.vue';
import TextControl from './TextControl.vue';
import ToggleControl from './ToggleControl.vue';

/** The component that draws `item`: it takes the item and the form's colors. */
export function nativeControlOf(item: FormWidgetItem): Component {
  switch (item.control) {
    case 'text':
      return TextControl;
    case 'toggle':
      return ToggleControl;
    case 'choice':
      return item.kind === 'list' ? ListControl : ComboControl;
    case 'button':
      return ButtonControl;
    case 'signature':
      return SignatureControl;
  }
}
