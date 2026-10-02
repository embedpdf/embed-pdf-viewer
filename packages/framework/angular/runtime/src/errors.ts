/**
 * The adapter's numbered errors, written like Angular's own (`NG0201`): a code, what went wrong,
 * how to fix it, and the page that explains it. A code keeps its meaning once it ships, so a
 * search for `EPDF-101` always finds the right answer.
 *
 * Errors about the document (no document open yet, a permission missing) are the plugins'
 * `PluginError`s, the same in every framework; these are only about how the app set up the
 * adapter.
 */
const ERRORS_PAGE = 'https://www.embedpdf.com/docs/headless/angular/errors';

/** A setup mistake, with its code: `EPDF-101`. */
export class EpdfError extends Error {
  override readonly name = 'EpdfError';

  constructor(
    readonly code: `EPDF-${number}`,
    problem: string,
  ) {
    super(`${code}: ${problem} See ${ERRORS_PAGE}#${code.toLowerCase()}`);
  }
}

/** EPDF-101: a service, component or directive of the viewer, with no viewer above it. */
export const noViewerError = (what: string): EpdfError =>
  new EpdfError(
    'EPDF-101',
    `${what} found no viewer. Add provideEmbedPdf() to this component's providers, or to your app config.`,
  );

/** EPDF-102: a plugin's service, where no viewer above it has that plugin. */
export const noPluginError = (service: string, feature: string): EpdfError =>
  new EpdfError(
    'EPDF-102',
    `inject(${service}) found no viewer with its plugin. Add ${feature} to provideEmbedPdf() ` +
      `in this component's providers, or in your app config.`,
  );

/** EPDF-103: something that draws on a page, outside a page. */
export const outsidePageError = (what: string): EpdfError =>
  new EpdfError(
    'EPDF-103',
    `${what} draws on a page. Put it inside <ng-template epdfPage> in an <epdf-stage>.`,
  );

/** EPDF-104: part of a Stage, outside one. */
export const outsideStageError = (what: string): EpdfError =>
  new EpdfError('EPDF-104', `${what} belongs to a Stage. Put it inside <epdf-stage>.`);

/** EPDF-105: a call that needs the engine, made while rendering on the server. */
export const onServerError = (what: string): EpdfError =>
  new EpdfError(
    'EPDF-105',
    `${what} needs the engine, which runs in the browser only. Call it from an event or ` +
      `afterNextRender(), or put the viewer in a @defer block.`,
  );
