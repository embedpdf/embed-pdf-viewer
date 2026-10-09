import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFilePickerProvider, pickRequestedFile } from '../src/file-picker';
import { fakeElement } from './helpers/fake-element';

/** A document whose file inputs "pick" `file` when clicked (or cancel, for `null`). */
function fileDialog(file: object | null) {
  const inputs: Array<{ accept: string }> = [];
  vi.stubGlobal('window', fakeElement());
  vi.stubGlobal('document', {
    body: { appendChild: () => undefined },
    createElement: () => {
      const input = fakeElement({
        accept: '',
        multiple: false,
        type: '',
        style: {},
        files: file ? [file] : [],
        remove: () => undefined,
        click: () => input.dispatch(file ? 'change' : 'cancel'),
      });
      inputs.push(input);
      return input;
    },
  });
  return inputs;
}

afterEach(() => vi.unstubAllGlobals());

describe('pickRequestedFile', () => {
  it('opens the dialog with the request’s filter and hands the file over as the data', async () => {
    const file = { name: 'stamp.png' };
    const inputs = fileDialog(file);
    await expect(pickRequestedFile({ accept: 'image/png' })).resolves.toEqual({ data: file });
    expect(inputs[0]!.accept).toBe('image/png');
  });

  it('takes any file without a filter, and answers null for a dismissed dialog', async () => {
    const inputs = fileDialog(null);
    await expect(pickRequestedFile({})).resolves.toBeNull();
    expect(inputs[0]!.accept).toBe('*/*');
  });
});

describe('installFilePickerProvider', () => {
  /** A document's port: the provider it holds now. */
  function port() {
    const annotation = {
      provider: null as string | null,
      setFilePickerProvider: vi.fn((provider: string | null) => {
        annotation.provider = provider;
        return () => {
          if (annotation.provider === provider) annotation.provider = null;
        };
      }),
    };
    return annotation;
  }

  it('installs the provider until the removal it returns', () => {
    const annotation = port();
    const onRepeat = vi.fn();
    const remove = installFilePickerProvider(annotation, 'dialog', onRepeat);
    expect(annotation.provider).toBe('dialog');
    remove();
    expect(annotation.provider).toBeNull();
    expect(onRepeat).not.toHaveBeenCalled();
  });

  it('tells of a second install on the same document while the first is there', () => {
    const annotation = port();
    const other = port();
    const onRepeat = vi.fn();
    const first = installFilePickerProvider(annotation, 'dialog', onRepeat);
    installFilePickerProvider(other, 'dialog', onRepeat);
    expect(onRepeat).not.toHaveBeenCalled();

    const second = installFilePickerProvider(annotation, 'library', onRepeat);
    expect(onRepeat).toHaveBeenCalledTimes(1);
    expect(annotation.provider).toBe('library');
    second();
    first();
    // Both gone: the next install is the only one again.
    installFilePickerProvider(annotation, null, onRepeat);
    expect(onRepeat).toHaveBeenCalledTimes(1);
  });
});
