/**
 * How the adapter reaches a plugin: its capability token, resolved for one document (the one in
 * scope, else the active one) after every change of the kernel. A `CapabilityBinding` turns that
 * into what Angular code wants: signals for values, late-bound methods for calls, and RxJS
 * streams for events. Services, the Stage and the page layers are all built on it.
 *
 * Resolution is a read, not a cache: a document becomes resolvable when it's ready, while its
 * id stays the same, so a capability looked up once by id would go stale.
 */
import { computed, inject, signal, untracked, type Signal } from '@angular/core';
import {
  isPluginError,
  isReadMember,
  PluginError,
  returnsPromise,
  shallowEqual,
} from '@embedpdf/core';
import type { CapabilityToken, EventHook, Kernel } from '@embedpdf/core';
import { Observable } from 'rxjs';
import { noViewerError } from './errors';
import { EpdfKernelHost } from './kernel-host';
import { EPDF_DOCUMENT_SCOPE } from './tokens';

/** The viewer above this injection context; EPDF-101, naming `what`, when there is none. */
export function injectKernelHost(what: string): EpdfKernelHost {
  const host = inject(EpdfKernelHost, { optional: true });
  if (!host) throw noViewerError(what);
  return host;
}

const FOLLOW_ACTIVE: Signal<string | null> = signal(null).asReadonly();

/**
 * The document this injection context talks to: the id the nearest `[epdfDocumentScope]` (or a
 * Stage with a `[document]`) gives, or null to follow the active document.
 */
export function injectDocumentScope(): Signal<string | null> {
  return inject(EPDF_DOCUMENT_SCOPE, { optional: true })?.id ?? FOLLOW_ACTIVE;
}

/**
 * A plugin's capability for this injection context's document, as a signal: null while it
 * can't resolve (no such plugin, no document, or one that isn't ready yet). For plugin authors;
 * apps use a plugin's service (`inject(EpdfSearch)`). Call it in an injection context.
 */
export function injectCapability<Capability>(
  token: CapabilityToken<Capability>,
): Signal<Capability | null> {
  const binding = new CapabilityBinding(
    injectKernelHost(`injectCapability(${token.name})`),
    () => token,
    injectDocumentScope(),
  );
  return binding.capability;
}

/** One capability token, for one document, as signals, calls and streams. */
export class CapabilityBinding<Capability> {
  /** The capability, or null while it can't resolve. */
  readonly capability: Signal<Capability | null>;

  /**
   * @param token the token to resolve; a function, because a component's token is an input
   * @param documentId the document to resolve it for, or null for the active one
   */
  constructor(
    readonly host: EpdfKernelHost,
    private readonly token: () => CapabilityToken<Capability>,
    private readonly documentId: () => string | null,
  ) {
    this.capability = host.read(
      (kernel) => this.resolve(kernel),
      () => null,
    );
  }

  /**
   * A value read through the capability, as a signal that changes only when `equal` says the
   * value did. `empty` while the capability can't resolve, and for the one read that can land
   * between a document closing and its capability going away.
   */
  select<R>(
    read: (capability: Capability) => R,
    empty: R,
    equal: (left: R, right: R) => boolean = shallowEqual,
  ): Signal<R> {
    return this.host.read(
      (kernel) => {
        const capability = this.resolve(kernel);
        if (!capability) return empty;
        try {
          return read(capability);
        } catch {
          return empty;
        }
      },
      () => empty,
      equal,
    );
  }

  /**
   * The capability, for `call`, which needs it now. Without a document a document plugin
   * refuses with `not-ready` ("no document is open"), the same refusal every framework's
   * stand-in gives (`standInFor` in `@embedpdf/core`); a token no plugin provides throws the
   * kernel's reason, because that is a setup mistake.
   */
  require(call: string): Capability {
    const token = this.token();
    const kernel = this.host.requireKernel(token.name, call);
    const documentId = untracked(this.documentId) ?? undefined;
    const capability = kernel.tryCapability(token, documentId);
    if (capability) return capability;
    if (kernel.scopeOf(token) === 'document') {
      throw new PluginError('not-ready', token.name, 'no document is open');
    }
    return kernel.capability(token, documentId);
  }

  /**
   * The capability's method `name`, looked up when it's called, so a method kept in a field
   * acts on the document current at that moment. The same function for the binding's lifetime.
   *
   * A read (a method named `get*`, `list*`, `is*`, `has*` or `can*`: `canUpdate()`,
   * `getZoomLevel()`) is state too: called in a template, a `computed()` or an `effect()`, it's
   * read again after each change of the kernel and of the document in scope, and wakes its
   * reader only when its answer changes. So a button it disables follows the selection, the
   * active document and its permissions. Other methods track nothing: an `effect()` that calls a
   * verb doesn't run again because the verb changed the document.
   *
   * Without a document a method refuses with `not-ready`: one that returns a promise (the token's
   * `promises`) returns the refusal as a rejected promise, so `.catch()` sees it; others throw.
   */
  method<Name extends keyof Capability>(name: Name): Capability[Name] {
    return this.late(String(name), (capability) => capability, name);
  }

  /**
   * The method `name` of the capability's namespace `namespace` (`custom.update()`), late-bound
   * the way {@link method} is. A service gives a namespace an object of its own
   * (`metadata.custom`), built from these, {@link select} and {@link stream}.
   */
  namespaceMethod<Key extends keyof Capability, Name extends keyof Capability[Key]>(
    namespace: Key,
    name: Name,
  ): Capability[Key][Name] {
    return this.late(
      `${String(namespace)}.${String(name)}`,
      (capability) => capability[namespace],
      name,
    );
  }

  /**
   * One of the capability's events, as an RxJS stream. A subscription follows the document:
   * when it changes (another tab, a document that opens or closes), it moves to the new
   * document's capability. Nothing is emitted while there is none.
   */
  stream<T>(pick: (capability: Capability) => EventHook<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      let current: Capability | null = null;
      let listening: AbortController | null = null;
      const follow = () => {
        const kernel = untracked(this.host.kernel);
        const next = kernel ? untracked(() => this.resolve(kernel)) : null;
        if (next === current) return;
        listening?.abort();
        listening = null;
        current = next;
        if (!next) return;
        listening = new AbortController();
        pick(next)((event) => subscriber.next(event), { signal: listening.signal });
      };
      const stop = this.host.subscribe(follow);
      follow();
      return () => {
        stop();
        listening?.abort();
      };
    });
  }

  private resolve(kernel: Kernel): Capability | null {
    return kernel.tryCapability(this.token(), this.documentId() ?? undefined);
  }

  /** `owner(capability)[name]`, looked up when called; a read tracks what its answer reads. */
  private late<Owner, Name extends keyof Owner>(
    label: string,
    owner: (capability: Capability) => Owner,
    name: Name,
  ): Owner[Name] {
    const call = `${label}()`;
    const run = (args: unknown[]): unknown => {
      let target: Owner;
      try {
        target = owner(this.require(call));
      } catch (error) {
        // Not ready: a method that returns a promise rejects, as the capability would.
        if (isPluginError(error, 'not-ready') && returnsPromise(this.token(), label)) {
          return Promise.reject(error);
        }
        throw error;
      }
      return (target[name] as unknown as (...args: unknown[]) => unknown).apply(target, args);
    };
    if (!isReadMember(String(name))) {
      return ((...args: unknown[]) => untracked(() => run(args))) as Owner[Name];
    }
    // A computed of its own for each call: whoever reads the check depends on its answer, not
    // on every change of the kernel. Outside a reactive context it's one plain call.
    return ((...args: unknown[]) =>
      computed(() => {
        this.documentId();
        this.host.revision();
        return run(args);
      })()) as Owner[Name];
  }
}
