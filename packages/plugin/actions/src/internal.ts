/**
 * The HOST surface: what sibling plugins (stage, annotation, link, form) need
 * to register executors, session sinks, and trigger sources. Same runtime
 * token as the public one, wider type — import from
 * `@embedpdf/plugin-actions/contract/host`. `/internal` keeps this legacy
 * re-export plus implementation helpers; it is an API-visibility boundary,
 * not a bundle-purity boundary.
 */
export * from './host-contract';
