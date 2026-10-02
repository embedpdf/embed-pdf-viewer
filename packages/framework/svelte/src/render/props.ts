/** The props of `<RenderLayer>`. */
export interface RenderLayerProps {
  /**
   * Bake annotations into the page picture (default true). Pass false when an
   * `<AnnotationLayer>` draws them, so they aren't drawn twice.
   */
  annotations?: boolean;
  /**
   * Mount the tile plane (default true). Whether it spends anything is the render plugin's
   * arithmetic: leave it on, and pass false only for a view that must never tile.
   */
  tiles?: boolean;
}
