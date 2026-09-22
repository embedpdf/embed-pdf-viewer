/** @embedpdf/plugin-redaction/internal — framework/host helpers; not for application code. */
export * from './host-contract';
export { createRedactionCapability, createRedactionController } from './controller';
export { initialRedactionState, redactionReducer } from './model';
