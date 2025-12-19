import { h, render } from 'preact';
import { PDFViewer, PDFViewerConfig } from '@/components/app';
import { PluginRegistry } from '@embedpdf/core';
import {
  ThemeConfig,
  ThemePreference,
  Theme,
  lightTheme,
  darkTheme,
  resolveTheme,
  resolveColorScheme,
  onSystemColorSchemeChange,
  generateThemeStylesheet,
} from '@/config/theme';
import {
  IconConfig,
  IconsConfig,
  registerIcon as globalRegisterIcon,
  registerIcons as globalRegisterIcons,
} from '@/config/icon-registry';

const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export class EmbedPdfContainer extends (BaseElement as typeof HTMLElement) {
  private root: ShadowRoot;
  private _config?: PDFViewerConfig;
  private _registryPromise: Promise<PluginRegistry>;
  private _resolveRegistry: ((registry: PluginRegistry) => void) | null = null;
  private themeStyleEl: HTMLStyleElement | null = null;
  private systemPreferenceCleanup: (() => void) | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });

    // Create promise for registry that will be resolved when ready
    this._registryPromise = new Promise((resolve) => {
      this._resolveRegistry = resolve;
    });
  }

  connectedCallback() {
    // If config isn't provided via script, build it from attributes
    if (!this._config) {
      this._config = {
        src: this.getAttribute('src') || '/demo.pdf',
        worker: this.getAttribute('worker') !== 'false',
        // Support theme attribute: <embedpdf-container theme="dark">
        theme: this.parseThemeAttribute(),
      };
    }
    this.setupTheme();
    this.renderViewer();
  }

  disconnectedCallback() {
    // Clean up system preference listener
    this.systemPreferenceCleanup?.();
    this.systemPreferenceCleanup = null;
  }

  /**
   * Parse theme from HTML attribute
   */
  private parseThemeAttribute(): ThemeConfig | undefined {
    const themeAttr = this.getAttribute('theme');
    if (!themeAttr) return undefined;

    // Simple preference: "light", "dark", "system"
    if (['light', 'dark', 'system'].includes(themeAttr)) {
      return { preference: themeAttr as ThemePreference };
    }

    return undefined;
  }

  // Setter for config
  set config(newConfig: PDFViewerConfig) {
    this._config = newConfig;

    // Register any icons provided in config
    if (newConfig.icons) {
      globalRegisterIcons(newConfig.icons);
    }

    if (this.isConnected) {
      this.setupTheme();
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

  /**
   * Gets the current theme preference
   */
  get themePreference(): ThemePreference {
    return this._config?.theme?.preference || 'system';
  }

  /**
   * Gets the currently active (resolved) color scheme
   */
  get activeColorScheme(): 'light' | 'dark' {
    return resolveColorScheme(this.themePreference);
  }

  /**
   * Gets the currently active theme object
   */
  get activeTheme(): Theme {
    return this.resolveActiveTheme();
  }

  /**
   * Resolves the active theme based on config and system preference
   */
  private resolveActiveTheme(): Theme {
    const themeConfig = this._config?.theme;
    const colorScheme = resolveColorScheme(themeConfig?.preference || 'system');

    // Get base theme
    const baseTheme = colorScheme === 'dark' ? darkTheme : lightTheme;

    // Apply custom overrides if provided (now directly on themeConfig.light/dark)
    const colorOverrides = themeConfig?.[colorScheme];
    return resolveTheme(colorOverrides, baseTheme);
  }

  /**
   * Sets up theme injection and system preference listener
   */
  private setupTheme() {
    // Clean up any existing system preference listener
    this.systemPreferenceCleanup?.();
    this.systemPreferenceCleanup = null;

    const preference = this._config?.theme?.preference || 'system';

    // If preference is 'system', set up listener for OS preference changes
    if (preference === 'system') {
      this.systemPreferenceCleanup = onSystemColorSchemeChange((scheme) => {
        this.injectTheme();
        // Dispatch event for external listeners
        this.dispatchEvent(
          new CustomEvent('themechange', {
            detail: {
              preference: 'system',
              colorScheme: scheme,
              theme: this.activeTheme,
            },
            bubbles: true,
          }),
        );
      });
    }

    this.injectTheme();
  }

  /**
   * Injects the theme CSS into the shadow root
   */
  private injectTheme() {
    const theme = this.resolveActiveTheme();
    const css = generateThemeStylesheet(theme);

    // Find existing theme style or create new one
    let existingStyle = this.root.querySelector(
      'style[data-embedpdf-theme]',
    ) as HTMLStyleElement | null;

    if (!existingStyle) {
      existingStyle = document.createElement('style');
      existingStyle.setAttribute('data-embedpdf-theme', '');
      this.root.appendChild(existingStyle); // Append at end, after Preact content
    }

    this.themeStyleEl = existingStyle;
    this.themeStyleEl.textContent = css;

    // Set data attribute for external CSS targeting
    this.setAttribute('data-color-scheme', this.activeColorScheme);
  }

  /**
   * Updates the theme at runtime
   * @param theme - New theme configuration or simple preference
   */
  setTheme(theme: ThemeConfig | ThemePreference) {
    if (this._config) {
      // Handle simple preference string
      if (typeof theme === 'string') {
        this._config.theme = { ...this._config.theme, preference: theme };
      } else {
        // Merge new config with existing, preserving unspecified values
        this._config.theme = {
          ...this._config.theme,
          ...theme,
        };
      }
      this.setupTheme();

      // Dispatch event
      this.dispatchEvent(
        new CustomEvent('themechange', {
          detail: {
            preference: this.themePreference,
            colorScheme: this.activeColorScheme,
            theme: this.activeTheme,
          },
          bubbles: true,
        }),
      );
    }
  }

  /**
   * Registers a custom icon
   * @param name - Unique icon name
   * @param config - Icon configuration
   */
  registerIcon(name: string, config: IconConfig) {
    globalRegisterIcon(name, config);
  }

  /**
   * Registers multiple custom icons
   * @param icons - Map of icon name to configuration
   */
  registerIcons(icons: IconsConfig) {
    globalRegisterIcons(icons);
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

    // ADDED: Re-inject theme AFTER Preact render (since render clears the container)
    this.injectTheme();
  }
}
