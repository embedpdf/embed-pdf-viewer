/**
 * One service per plugin: `inject(EpdfSearch)` has the plugin's methods, every value of its
 * State table as a signal (`search.hitCount()`), its events as RxJS streams
 * (`search.completed$`), and, when the plugin has settings, `settings()`, `getSettings()`,
 * `updateSettings()`, `resetSettings()` and `settingsChanged$`. `pluginService()` builds all of that from what the
 * plugin declares already, so a plugin's service is a few lines; the package README's "Adding a
 * plugin binding" shows one.
 *
 * A service acts on the document of the injector that created it: under `[epdfDocumentScope]`
 * that document, else the active one. Its methods are looked up when they're called, so a
 * method kept in a field acts on the document current at that moment.
 */
import { computed, inject, type Signal } from '@angular/core';
import type {
  CapabilityToken,
  EventHook,
  SettingsChangedEvent,
  SettingsOf,
  StateDeclaration,
} from '@embedpdf/core';
import type { Observable } from 'rxjs';
import { CapabilityBinding, injectDocumentScope } from './capability';
import { noPluginError, noViewerError } from './errors';
import { EpdfKernelHost } from './kernel-host';

/** The names of a capability's events: its `on…` members. */
export type EventName<Capability> = {
  [Key in keyof Capability]-?: Key extends `on${string}`
    ? Capability[Key] extends EventHook<infer _Payload>
      ? Key
      : never
    : never;
}[keyof Capability];

/** An event's stream on a service: `onCompleted` is `completed$`. */
export type StreamName<Event> = Event extends `on${infer Name}` ? `${Uncapitalize<Name>}$` : never;

type EventOf<Hook> = Hook extends EventHook<infer Event> ? Event : never;

/** The settings members, for a capability that has the settings calls. */
type SettingsMembers<Capability> = [SettingsOf<Capability>] extends [never]
  ? unknown
  : {
      /** The plugin's settings, with or without a document. */
      readonly settings: Signal<SettingsOf<Capability>>;
      /** Fires once for each call that changed a setting. */
      readonly settingsChanged$: Observable<SettingsChangedEvent<SettingsOf<Capability>>>;
    } & Pick<Capability, ('getSettings' | 'updateSettings' | 'resetSettings') & keyof Capability>;

/** What a plugin service built by `pluginService()` has, on top of the members its class adds. */
export type PluginServiceMembers<
  Capability,
  State extends object,
  Method extends keyof Capability,
  Event extends EventName<Capability>,
> = { readonly [Key in Method]-?: Capability[Key] } & {
  readonly [Key in keyof State]-?: Signal<State[Key]>;
} & {
  readonly [Key in Event as StreamName<Key>]: Observable<EventOf<Capability[Key]>>;
} & SettingsMembers<Capability>;

/**
 * The class `pluginService()` returns, which a plugin's service extends. It has a name so the
 * built declarations say `PluginServiceClass<SearchCapability, …>` and the app's compiler works
 * out each member from the plugin's own types, instead of spelling out every member's type,
 * which would name packages the app may not have installed.
 */
export type PluginServiceClass<
  Capability,
  State extends object,
  Method extends keyof Capability,
  Event extends EventName<Capability>,
> = abstract new () => EpdfPluginService<Capability> &
  PluginServiceMembers<Capability, State, Method, Event>;

export interface PluginServiceSpec<
  Capability,
  State extends object,
  Method extends keyof Capability,
  Event extends EventName<Capability>,
> {
  /** The service's class name, as errors show it: `'EpdfSearch'`. */
  readonly name: string;
  /**
   * The feature that registers the plugin, as errors show it: `'withSearch()'`. Left out for
   * the viewer's own services, which `provideEmbedPdf()` always has.
   */
  readonly feature?: string;
  readonly token: CapabilityToken<Capability>;
  /** The plugin's State table (`defineState`): each field becomes a signal of the same name. */
  readonly state?: StateDeclaration<Capability, State>;
  /** The plugin's Methods table: each becomes a method of the same name. */
  readonly methods: readonly Method[];
  /** The plugin's events: `onCompleted` becomes the stream `completed$`. */
  readonly events?: readonly Event[];
}

/**
 * The base every plugin service extends. Its members are for the service's own class, which
 * adds what the generic part can't: a signal with arguments (`hitsOn(page)`), a namespace
 * (`custom.fields()`), a helper that needs the caller's injection context.
 */
export abstract class EpdfPluginService<Capability> {
  /** The plugin's capability for this service's document. */
  protected readonly binding: CapabilityBinding<Capability>;

  protected constructor(spec: {
    name: string;
    feature?: string;
    token: CapabilityToken<Capability>;
  }) {
    const host = inject(EpdfKernelHost, { optional: true });
    // A plugin's service names its feature, whether the viewer is missing or only the plugin.
    if (spec.feature && !host?.provides(spec.token)) throw noPluginError(spec.name, spec.feature);
    if (!host) throw noViewerError(`inject(${spec.name})`);
    this.binding = new CapabilityBinding(host, () => spec.token, injectDocumentScope());
  }
}

/**
 * The base class of a plugin's service, built from the plugin's declarations:
 *
 *   @Injectable({ providedIn: 'root' })
 *   export class EpdfSearch extends pluginService({
 *     name: 'EpdfSearch',
 *     feature: 'withSearch()',
 *     token: SearchToken,
 *     state: searchState,
 *     methods: ['search', 'clear', 'goToHit'],
 *     events: ['onCompleted'],
 *   }) {}
 *
 * `providedIn: 'root'` is only the fallback that turns a missing viewer into EPDF-102: the
 * service's feature provides it next to the viewer, and `[epdfDocumentScope]` again.
 */
export function pluginService<
  Capability,
  State extends object = Record<never, never>,
  Method extends keyof Capability = never,
  Event extends EventName<Capability> = never,
>(
  spec: PluginServiceSpec<Capability, State, Method, Event>,
): PluginServiceClass<Capability, State, Method, Event> {
  abstract class PluginService extends EpdfPluginService<Capability> {
    constructor() {
      super(spec);
      const members = this as unknown as Record<string, unknown>;
      const binding = this.binding;

      if (spec.state) {
        const state = spec.state;
        // One read of the whole table, compared field by field, then one signal per field: a
        // template that reads `hitCount()` wakes only when the hit count changes.
        const whole = binding.select((capability) => state.read(capability), state.empty);
        for (const field of Object.keys(state.empty) as (keyof State & string)[]) {
          members[field] = computed(() => whole()[field]);
        }
      }

      for (const name of spec.methods) members[name as string] = binding.method(name);

      for (const event of spec.events ?? []) {
        const stream = `${event.charAt(2).toLowerCase()}${event.slice(3)}$`;
        members[stream] = binding.stream(
          (capability) => capability[event] as unknown as EventHook<unknown>,
        );
      }

      // Settings belong to the plugin as the app registered it, not to a document: they work
      // with no document open, and before the kernel exists.
      const host = binding.host;
      if (host.plugins.some((plugin) => plugin.token === spec.token && plugin.settings)) {
        const settings = host.settingsOf<object>(spec.token);
        members['settings'] = settings.current;
        // A read, like every `get*` method: a template or an effect that calls it follows it.
        members['getSettings'] = () => settings.current();
        members['updateSettings'] = settings.update;
        members['resetSettings'] = settings.reset;
        members['settingsChanged$'] = host.stream(
          (kernel) => kernel.settingsOf(spec.token).onSettingsChanged,
        );
      }
    }
  }
  return PluginService as unknown as PluginServiceClass<Capability, State, Method, Event>;
}
