/**
 * @embedpdf/viewer-chrome — the full viewer as a component.
 *
 * The curated surface is deliberately tiny while the config contract is being
 * frozen: the composed viewer here, the structure schema at ./chrome, the
 * command vocabulary at ./commands, the stylesheet at ./styles.css. Everything
 * else under src/ is internal until the customization surface lands.
 */
export { FullViewer, type FullViewerProps } from './viewer';
