/**
 * Library contains the common definitions of data types and logic
 *
 * @remarks
 * The `@embedpdf/models` defines the interface and classes which are used to
 * handling PDF files.
 *
 * @packageDocumentation
 */
export * from './geometry';
export * from './logger';
export * from './pdf';
export * from './task';
export * from './color';
export * from './date';
export * from './helpers';
export * from './uuid';
export * from './compound-task';

/**
 * ignore will do nothing when called.
 *
 * @public
 */
export function ignore() {}
