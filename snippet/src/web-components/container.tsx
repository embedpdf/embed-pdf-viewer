import { h, render } from 'preact';
import { PDFViewer, PDFViewerConfig } from '@/components/app';
import { PluginRegistry } from '@embedpdf/core';

export class EmbedPdfContainer extends HTMLElement {
  private root: ShadowRoot;
  private _config?: PDFViewerConfig;
  private _registryPromise: Promise<PluginRegistry>;
  private _resolveRegistry: ((registry: PluginRegistry) => void) | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });

    // Create promise for registry that will be resolved when ready
    this._registryPromise = new Promise((resolve) => {
      this._resolveRegistry = resolve;
    });
  }

  connectedCallback() {
    // If config isn’t provided via script, build it from attributes
    if (!this._config) {
      this._config = {
        src: this.getAttribute('src') || '/demo.pdf',
        worker: this.getAttribute('worker') !== 'false',
      };
    }
    this.renderViewer();
  }

  // Setter for config
  set config(newConfig: PDFViewerConfig) {
    this._config = newConfig;
    if (this.isConnected) {
      this.renderViewer();
    }
  }

  // Getter for config
  get config(): PDFViewerConfig | undefined {
    return this._config;
  }

  // Getter for registry promise
  get registry(): Promise<PluginRegistry> {
    return this._registryPromise;
  }

  // Callback to receive registry from PDFViewer
  private handleRegistryReady = (registry: PluginRegistry) => {
    if (this._resolveRegistry) {
      this._resolveRegistry(registry);
      this._resolveRegistry = null; // Clear after resolving
    }
  };

  renderViewer() {
    if (!this._config) return;
    render(
      <PDFViewer config={this._config} onRegistryReady={this.handleRegistryReady} />,
      this.root,
    );
  }
}
