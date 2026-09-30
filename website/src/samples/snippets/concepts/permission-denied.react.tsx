import { isPluginError } from '@embedpdf/react/runtime';
import { toFieldRef, useForm } from '@embedpdf/react/form';

export function SetTotalButton() {
  const form = useForm();

  const setTotal = async () => {
    try {
      await form.setValue(toFieldRef('total'), { value: '120.00' });
    } catch (error) {
      if (isPluginError(error, 'permission-denied')) {
        console.log(error.permission); // what was missing, such as 'doc.forms.fill'
      }
    }
  };

  return <button onClick={setTotal}>Set the total</button>;
}
