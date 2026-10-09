/** The props of `<RenderLayer>`. */
export interface RenderLayerProps {
  /**
   * Draw the annotations into the page's picture (`true`) or leave them out (`false`). Left
   * unset, the picture leaves them to an `<AnnotationLayer>` on the page, and otherwise draws them
   * when the user may read them.
   */
  annotations?: boolean;
  /** The same for the form fields, which a `<FormLayer>` paints. */
  formFields?: boolean;
  /**
   * Mount the tile plane (default true). Whether it spends anything is the render plugin's
   * arithmetic: leave it on, and pass false only for a view that must never tile.
   */
  tiles?: boolean;
}
