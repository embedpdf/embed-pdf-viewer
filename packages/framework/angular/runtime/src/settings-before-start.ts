/**
 * Settings before the kernel exists. With an engine that loads lazily, the app can read and
 * change a plugin's settings (and the viewer's) before the kernel is there to keep them. This
 * keeps the changes in order, shows what they add up to, and hands them to the kernel when it
 * arrives, so `settings()` and `updateSettings()` work from the first moment, as they do in
 * every other framework.
 *
 * The merge is the kernel's own (`mergeSettings` from `@embedpdf/core`), so the settings shown
 * before the kernel exists are the ones it then has.
 */
import { computed, signal, type Signal } from '@angular/core';
import { mergeSettings } from '@embedpdf/core';
import type { DeepPartial, SettingsDeclaration } from '@embedpdf/core';

/** One settings store's changes, kept until the kernel takes them. */
export class SettingsBeforeStart<T extends object> {
  private readonly changes = signal<readonly (DeepPartial<T> | 'reset')[]>([]);

  /** The settings the changes add up to, over what the app registered. */
  readonly current: Signal<T>;

  constructor(declaration: SettingsDeclaration<T>) {
    const registered = mergeSettings(
      declaration.defaults,
      declaration.registered,
      declaration.whole,
    );
    this.current = computed(() =>
      this.changes().reduce<T>(
        (settings, change) =>
          change === 'reset' ? registered : mergeSettings(settings, change, declaration.whole),
        registered,
      ),
    );
  }

  update(change: DeepPartial<T>): void {
    this.changes.update((changes) => [...changes, change]);
  }

  reset(): void {
    this.changes.update((changes) => [...changes, 'reset']);
  }

  /** Hand the changes to the kernel's store, in order, and forget them. */
  applyTo(store: { updateSettings(change: DeepPartial<T>): void; resetSettings(): void }): void {
    for (const change of this.changes()) {
      if (change === 'reset') store.resetSettings();
      else store.updateSettings(change);
    }
    this.changes.set([]);
  }
}
