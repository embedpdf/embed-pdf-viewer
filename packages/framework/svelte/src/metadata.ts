/**
 * @embedpdf/svelte/metadata — the document's properties and your own fields.
 *
 * The plugin keeps the metadata live off the document's event stream, so the state follows your
 * own edits and other sessions':
 *
 *   const metadata = useMetadata();
 *   const state = useMetadataState(); // state.metadata, state.custom, state.status
 *   await metadata.update({ title: 'New title' }); // resolves once the state shows it
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-metadata';

export { useMetadata, useMetadataEvent, useMetadataState } from './metadata/readers';
