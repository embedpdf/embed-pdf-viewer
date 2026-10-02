/** The props of the runtime's components: `<Viewer>`, `<DocumentGate>` and `<DocumentScope>`. */
import type { Snippet } from 'svelte';
import type {
  AnyPlugin,
  Engine,
  EngineFactory,
  FailedDocumentInfo,
  Identity,
  InitialDocument,
  Kernel,
  LockedDocumentInfo,
  ViewerPageSettings,
} from '@embedpdf/core';

export interface ViewerProps {
  /**
   * The engine, as an instance or a function. An instance (`{engine}`) is borrowed: the viewer
   * uses it and never destroys it, so one engine made at module scope serves every viewer; a
   * local engine is warmed up on mount. A function (`engine={() => localEngine()}`) is the
   * viewer's own: called on mount, destroyed on unmount. Read once, when the viewer mounts.
   */
  engine: Engine | EngineFactory;
  /** The plugins. Read once, when the viewer mounts. */
  plugins: AnyPlugin[];
  /** Documents to open on startup, with optional tab names. Read once. */
  initialDocuments?: InitialDocument[];
  /**
   * Called once the viewer has started, before the content mounts and before `initialDocuments`
   * open: the door for code that isn't a component (register commands, subscribe to events).
   */
  onReady?: (kernel: Kernel) => void;
  /**
   * Who the user is, for every document opened without an `identity` of its own. Documents
   * opened after a change use the new value; open ones keep theirs. The local engine only: the
   * cloud engine reads it from the document's token.
   */
  identity?: Identity;
  /**
   * What the user may do, as permissions, in every document opened without a `scope` of its own.
   * Left out, they may do everything. Changes reach the documents opened after them.
   */
  scope?: readonly string[];
  /** The color every part without a color of its own follows. CSS `--epdf-accent` wins over it. */
  accent?: string;
  /** How pages look: `background` before the picture arrives, and the `shadow` under each page. */
  page?: Partial<ViewerPageSettings>;
  /** Shown while the viewer starts. */
  fallback?: Snippet;
  /** Shown when the viewer couldn't start, with why. Without it, a failed start shows nothing. */
  error?: Snippet<[error: unknown]>;
  children?: Snippet;
}

export interface DocumentGateProps {
  /** Shown while this subtree has no document: none is open, or it's still opening. */
  fallback?: Snippet;
  /** Shown while the document waits for its password; `fallback` without it. */
  locked?: Snippet<[document: LockedDocumentInfo]>;
  /** Shown when the document couldn't be opened, with why; `fallback` without it. */
  error?: Snippet<[document: FailedDocumentInfo]>;
  children?: Snippet;
}

export interface DocumentScopeProps {
  /** The document everything inside talks to. */
  id: string;
  children?: Snippet;
}
