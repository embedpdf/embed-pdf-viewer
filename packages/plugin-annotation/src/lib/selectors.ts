import {
  AnnotationState,
  AnnotationDocumentState,
  SidebarAnnotationEntry,
  TrackedAnnotation,
} from './types';
import {
  PdfAnnotationSubtype,
  PdfTextAnnoObject,
  PdfAnnotationReplyType,
  PdfAnnotationObject,
} from '@embedpdf/models';
import { isSidebarAnnotation, isText } from './helpers';
import { ToolMap } from './tools/tools-utils';

/* ─────────── document state selectors ─────────── */

/** All annotations _objects_ on a single page (order preserved). */
export const getAnnotationsByPageIndex = (s: AnnotationDocumentState, page: number) =>
  (s.pages[page] ?? []).map((uid) => s.byUid[uid]);

/** Shortcut: every page → list of annotation objects. */
export const getAnnotations = (s: AnnotationDocumentState) => {
  const out: Record<number, ReturnType<typeof getAnnotationsByPageIndex>> = {};
  for (const p of Object.keys(s.pages).map(Number)) out[p] = getAnnotationsByPageIndex(s, p);
  return out;
};

/**
 * The full `TrackedAnnotation` for the current selection.
 * @deprecated Use getSelectedAnnotations() for multi-select support. Returns first selected or null.
 */
export const getSelectedAnnotation = (s: AnnotationDocumentState): TrackedAnnotation | null =>
  s.selectedUids.length > 0 ? (s.byUid[s.selectedUids[0]] ?? null) : null;

/** Get all selected TrackedAnnotations */
export const getSelectedAnnotations = (s: AnnotationDocumentState): TrackedAnnotation[] =>
  s.selectedUids
    .map((uid) => s.byUid[uid])
    .filter((ta): ta is TrackedAnnotation => ta !== undefined);

/** Get the IDs of all selected annotations */
export const getSelectedAnnotationIds = (s: AnnotationDocumentState): string[] => s.selectedUids;

/** Get a tracked annotation by its ID */
export const getAnnotationByUid = (s: AnnotationDocumentState, uid: string) => s.byUid[uid] ?? null;

/**
 * Get selected annotation on a specific page (single, for backward compatibility)
 * @deprecated Use getSelectedAnnotationsByPageIndex() for multi-select support.
 */
export const getSelectedAnnotationByPageIndex = (
  s: AnnotationDocumentState,
  pageIndex: number,
): TrackedAnnotation | null => {
  const pageUids = s.pages[pageIndex] ?? [];

  // Find the first selected UID that's on the requested page
  for (const uid of s.selectedUids) {
    if (pageUids.includes(uid)) {
      return s.byUid[uid] ?? null;
    }
  }

  return null;
};

/** Get all selected annotations on a specific page */
export const getSelectedAnnotationsByPageIndex = (
  s: AnnotationDocumentState,
  pageIndex: number,
): TrackedAnnotation[] => {
  const pageUids = new Set(s.pages[pageIndex] ?? []);
  return s.selectedUids
    .filter((uid) => pageUids.has(uid))
    .map((uid) => s.byUid[uid])
    .filter((ta): ta is TrackedAnnotation => ta !== undefined);
};

/** Check if a given annotation is in the current selection. */
export const isAnnotationSelected = (s: AnnotationDocumentState, id: string): boolean =>
  s.selectedUids.includes(id);

/** Check if multiple annotations are selected */
export const hasMultipleSelected = (s: AnnotationDocumentState): boolean =>
  s.selectedUids.length > 1;

/**
 * Returns the current defaults for a specific tool by its ID.
 * This is fully type-safe and infers the correct return type.
 *
 * @param state The annotation plugin's state.
 * @param toolId The ID of the tool (e.g., 'highlight', 'pen').
 * @returns The tool's current `defaults` object, or `undefined` if not found.
 */
export function getToolDefaultsById<K extends keyof ToolMap>(
  state: AnnotationState,
  toolId: K,
): ToolMap[K]['defaults'] | undefined {
  // Find the tool in the state's tool array.
  const tool = state.tools.find((t) => t.id === toolId);

  // The `as` cast is safe because the generic signature guarantees
  // the return type to the caller.
  return tool?.defaults as ToolMap[K]['defaults'] | undefined;
}

/**
 * Collect every sidebar-eligible annotation and attach its TEXT replies,
 * grouped by page for efficient rendering.
 *
 * Result shape:
 * {
 *   0: [{ page: 0, annotation: <TrackedAnnotation>, replies: [ … ] }, ...],
 *   1: [{ page: 1, annotation: <TrackedAnnotation>, replies: [ … ] }, ...],
 *   …
 * }
 */
export const getSidebarAnnotationsWithRepliesGroupedByPage = (
  s: AnnotationDocumentState,
): Record<number, SidebarAnnotationEntry[]> => {
  /* ------------------------------------------------------------
   * 1.  Build an index of TEXT replies keyed by their parent ID
   * ------------------------------------------------------------ */
  const repliesByParent: Record<string, TrackedAnnotation<PdfTextAnnoObject>[]> = {};

  for (const uidList of Object.values(s.pages)) {
    for (const uid of uidList) {
      const ta = s.byUid[uid];
      if (ta && isText(ta)) {
        const parentId = ta.object.inReplyToId;
        if (parentId) (repliesByParent[parentId] ||= []).push(ta);
      }
    }
  }

  /* ------------------------------------------------------------
   * 2.  Gather sidebar annotations and group them by page
   * ------------------------------------------------------------ */
  const out: Record<number, SidebarAnnotationEntry[]> = {};

  for (const [pageStr, uidList] of Object.entries(s.pages)) {
    const page = Number(pageStr);
    const pageAnnotations: SidebarAnnotationEntry[] = [];

    for (const uid of uidList) {
      const ta = s.byUid[uid];
      if (ta && isSidebarAnnotation(ta)) {
        pageAnnotations.push({
          page,
          annotation: ta,
          replies: repliesByParent[ta.object.id] ?? [],
        });
      }
    }

    // Only add pages that have annotations
    if (pageAnnotations.length > 0) {
      out[page] = pageAnnotations;
    }
  }

  return out;
};

/**
 * Collect every sidebar-eligible annotation and attach its TEXT replies.
 *
 * Result shape:
 * [
 *   { page: 0, annotation: <TrackedAnnotation>, replies: [ … ] },
 *   { page: 1, annotation: <TrackedAnnotation>, replies: [ … ] },
 *   …
 * ]
 */
export const getSidebarAnnotationsWithReplies = (
  s: AnnotationDocumentState,
): SidebarAnnotationEntry[] => {
  const grouped = getSidebarAnnotationsWithRepliesGroupedByPage(s);
  const out: SidebarAnnotationEntry[] = [];

  // Flatten the grouped structure while maintaining page order
  const sortedPages = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);
  for (const page of sortedPages) {
    out.push(...grouped[page]);
  }

  return out;
};

/* ─────────── IRT (In Reply To) selectors ─────────── */

/**
 * Get all IRT child annotation info for cascade delete.
 * Returns array of { id, pageIndex } for each annotation that references parentId.
 */
export const getIRTChildIds = (
  s: AnnotationDocumentState,
  parentId: string,
): { id: string; pageIndex: number }[] => {
  const children: { id: string; pageIndex: number }[] = [];
  for (const uidList of Object.values(s.pages)) {
    for (const uid of uidList) {
      const ta = s.byUid[uid];
      if (ta && 'inReplyToId' in ta.object && ta.object.inReplyToId === parentId) {
        children.push({ id: ta.object.id, pageIndex: ta.object.pageIndex });
      }
    }
  }
  return children;
};

/**
 * Check if an annotation has any IRT children (links, replies, etc.)
 */
export const hasIRTChildren = (s: AnnotationDocumentState, parentId: string): boolean => {
  for (const uidList of Object.values(s.pages)) {
    for (const uid of uidList) {
      const ta = s.byUid[uid];
      if (ta && 'inReplyToId' in ta.object && ta.object.inReplyToId === parentId) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Get IRT children filtered by annotation type (e.g., only LINK).
 * @param s - The annotation document state
 * @param parentId - The parent annotation ID
 * @param types - Array of annotation subtypes to include
 */
export const getIRTChildrenByType = (
  s: AnnotationDocumentState,
  parentId: string,
  types: PdfAnnotationSubtype[],
): TrackedAnnotation[] => {
  const children: TrackedAnnotation[] = [];
  for (const uidList of Object.values(s.pages)) {
    for (const uid of uidList) {
      const ta = s.byUid[uid];
      if (
        ta &&
        'inReplyToId' in ta.object &&
        ta.object.inReplyToId === parentId &&
        types.includes(ta.object.type)
      ) {
        children.push(ta);
      }
    }
  }
  return children;
};

/**
 * Get link annotations attached to a parent annotation via IRT relationship.
 * @param s - The annotation document state
 * @param parentId - The parent annotation ID
 */
export const getAttachedLinks = (
  s: AnnotationDocumentState,
  parentId: string,
): TrackedAnnotation[] => getIRTChildrenByType(s, parentId, [PdfAnnotationSubtype.LINK]);

/**
 * Check if an annotation has attached link children.
 * @param s - The annotation document state
 * @param parentId - The parent annotation ID
 */
export const hasAttachedLinks = (s: AnnotationDocumentState, parentId: string): boolean =>
  getAttachedLinks(s, parentId).length > 0;

/* ─────────── Group (RT = Group) selectors ─────────── */

/**
 * Get the leader ID of a group.
 * If the annotation has inReplyToId with replyType = Group, return the inReplyToId.
 * Otherwise, the annotation itself is the leader.
 *
 * @param s - The annotation document state
 * @param annotationId - The annotation ID to find the group leader for
 * @returns The leader annotation ID, or undefined if annotation not found
 */
export const getGroupLeaderId = (
  s: AnnotationDocumentState,
  annotationId: string,
): string | undefined => {
  const ta = s.byUid[annotationId];
  if (!ta) return undefined;

  // If this annotation has IRT with RT = Group, the IRT target is the leader
  if (ta.object.inReplyToId && ta.object.replyType === PdfAnnotationReplyType.Group) {
    return ta.object.inReplyToId;
  }

  // Otherwise, check if this annotation is a leader (has group members pointing to it)
  // If it has no IRT or a different RT, it could be a leader
  return annotationId;
};

/**
 * Get all annotations in the same group as the given annotation.
 * Returns the leader plus all annotations with inReplyToId pointing to leader and replyType = Group.
 *
 * @param s - The annotation document state
 * @param annotationId - Any annotation ID in the group
 * @returns Array of TrackedAnnotations in the group (including the annotation itself)
 */
export const getGroupMembers = (
  s: AnnotationDocumentState,
  annotationId: string,
): TrackedAnnotation<PdfAnnotationObject>[] => {
  const leaderId = getGroupLeaderId(s, annotationId);
  if (!leaderId) return [];

  const members: TrackedAnnotation<PdfAnnotationObject>[] = [];

  // Add the leader
  const leader = s.byUid[leaderId];
  if (leader) members.push(leader);

  // Find all children with IRT pointing to leader and RT = Group
  for (const uidList of Object.values(s.pages)) {
    for (const uid of uidList) {
      const ta = s.byUid[uid];
      if (
        ta &&
        ta.object.inReplyToId === leaderId &&
        ta.object.replyType === PdfAnnotationReplyType.Group
      ) {
        members.push(ta);
      }
    }
  }

  return members;
};

/**
 * Check if an annotation is part of a group.
 * An annotation is in a group if:
 * - It has inReplyToId with replyType = Group (it's a group member), OR
 * - It has at least one other annotation pointing to it with replyType = Group (it's a group leader)
 *
 * @param s - The annotation document state
 * @param annotationId - The annotation ID to check
 * @returns true if the annotation is part of a group
 */
export const isInGroup = (s: AnnotationDocumentState, annotationId: string): boolean => {
  const ta = s.byUid[annotationId];
  if (!ta) return false;

  // Is this annotation a group member (has IRT with RT = Group)?
  if (ta.object.inReplyToId && ta.object.replyType === PdfAnnotationReplyType.Group) {
    return true;
  }

  // Is this annotation a group leader (has members pointing to it)?
  // Check if any annotation has inReplyToId = this annotation's ID with RT = Group
  for (const uidList of Object.values(s.pages)) {
    for (const uid of uidList) {
      const other = s.byUid[uid];
      if (
        other &&
        other.object.inReplyToId === annotationId &&
        other.object.replyType === PdfAnnotationReplyType.Group
      ) {
        return true;
      }
    }
  }

  return false;
};
