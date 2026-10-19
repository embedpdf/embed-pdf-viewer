/**
 * The link plugin's service and feature:
 *
 *   withLink()            the plugin, for provideEmbedPdf()
 *   inject(EpdfLink)      read a page's links, follow one from code (`activate()`), and the
 *                         events as streams (`activated$`, `loaded$`)
 *
 * The plugin never touches the browser, so the website opener is this package's: while the
 * service or an `<epdf-link-layer>` is there, following a website link opens it in a new tab
 * (only `http`, `https`, `mailto` and `tel`; anything else is refused and reported).
 */
import { effect, Injectable, untracked, type Signal } from '@angular/core';
import {
  CapabilityBinding,
  injectDocumentScope,
  pluginService,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import { linkPlugin, LinkToken } from '@embedpdf/plugin-link';
import {
  LinkToken as LinkHostToken,
  type LinkHostCapability,
} from '@embedpdf/plugin-link/contract/host';
import { openExternalUri } from '@embedpdf/web';

/**
 * Hand the link plugin this package's website opener while `link` resolves, and take it back
 * when the caller goes. Call it in an injection context: the effect lives as long as it.
 */
export function registerWebsiteOpener(link: Signal<LinkHostCapability | null>): void {
  effect((onCleanup) => {
    const host = link();
    if (host) onCleanup(untracked(() => host.registerUriOpener(openExternalUri)));
  });
}

/**
 * Links: `listLinks(page)`, `getLinkAt(page, point)`, `activate(link)` and the rest of the Links
 * page's methods, and its events as streams (`link.activated$`). While the service is there,
 * `activate()` opens a website in a new tab.
 */
@Injectable({ providedIn: 'root' })
export class EpdfLink extends pluginService({
  name: 'EpdfLink',
  feature: 'withLink()',
  token: LinkToken,
  methods: [
    'listLinks',
    'getLink',
    'getLinkAt',
    'listAllLinks',
    'ensureLoaded',
    'isLoaded',
    'getStatus',
    'activate',
    'activateAt',
    'resolve',
    'getLabel',
  ],
  events: ['onActivated', 'onLoaded'],
}) {
  constructor() {
    super();
    // The opener is registered through the plugin's host side, for this service's document.
    registerWebsiteOpener(
      new CapabilityBinding<LinkHostCapability>(
        this.binding.host,
        () => LinkHostToken,
        injectDocumentScope(),
      ).capability,
    );
  }
}

/** The link plugin: links that work, in every page with an `<epdf-link-layer>`. */
export function withLink(): EmbedPdfFeature {
  return { plugins: [linkPlugin()], services: [EpdfLink] };
}
