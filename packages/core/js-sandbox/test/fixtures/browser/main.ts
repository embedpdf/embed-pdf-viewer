import { createQuickJsSandbox } from '../../../src';

void createQuickJsSandbox()
  .then((sandbox) => {
    sandbox.dispose();
    document.body.dataset.quickjs = 'ready';
    document.body.textContent = 'QuickJS ready';
  })
  .catch((error: unknown) => {
    document.body.dataset.quickjs = 'error';
    document.body.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  });
