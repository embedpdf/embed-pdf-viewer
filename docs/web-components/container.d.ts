import { PDFViewerConfig } from '@/components/app';
import { PluginRegistry } from '@embedpdf/core';
import { ThemeConfig, ThemePreference, Theme } from '@/config/theme';
import { IconConfig, IconsConfig } from '@/config/icon-registry';
declare const EmbedPdfContainer_base: typeof HTMLElement;
export declare class EmbedPdfContainer extends EmbedPdfContainer_base {
    private root;
    private _config?;
    private _registryPromise;
    private _resolveRegistry;
    private themeStyleEl;
    private systemPreferenceCleanup;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    /**
     * Parse theme from HTML attribute
     */
    private parseThemeAttribute;
    set config(newConfig: PDFViewerConfig);
    get config(): PDFViewerConfig | undefined;
    get registry(): Promise<PluginRegistry>;
    /**
     * Gets the current theme preference
     */
    get themePreference(): ThemePreference;
    /**
     * Gets the currently active (resolved) color scheme
     */
    get activeColorScheme(): 'light' | 'dark';
    /**
     * Gets the currently active theme object
     */
    get activeTheme(): Theme;
    /**
     * Resolves the active theme based on config and system preference
     */
    private resolveActiveTheme;
    /**
     * Sets up theme injection and system preference listener
     */
    private setupTheme;
    /**
     * Injects the theme CSS into the shadow root
     */
    private injectTheme;
    /**
     * Updates the theme at runtime
     * @param theme - New theme configuration or simple preference
     */
    setTheme(theme: ThemeConfig | ThemePreference): void;
    /**
     * Registers a custom icon
     * @param name - Unique icon name
     * @param config - Icon configuration
     */
    registerIcon(name: string, config: IconConfig): void;
    /**
     * Registers multiple custom icons
     * @param icons - Map of icon name to configuration
     */
    registerIcons(icons: IconsConfig): void;
    private handleRegistryReady;
    renderViewer(): void;
}
export {};
//# sourceMappingURL=container.d.ts.map