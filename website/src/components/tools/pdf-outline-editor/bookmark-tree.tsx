'use client'

import React, { useState, useCallback } from 'react'
import { EditableBookmark, BookmarkFormData } from './types'
import { PdfDocumentObject, PdfZoomMode } from '@embedpdf/models'
import {
  ChevronRight,
  ChevronDown,
  Edit2,
  Trash2,
  Plus,
  GripVertical,
  Check,
  X,
  FileText,
} from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface BookmarkTreeProps {
  bookmarks: EditableBookmark[]
  document: PdfDocumentObject
  onChange: (bookmarks: EditableBookmark[]) => void
}

interface BookmarkItemProps {
  bookmark: EditableBookmark
  document: PdfDocumentObject
  depth: number
  onUpdate: (id: string, data: Partial<EditableBookmark>) => void
  onDelete: (id: string) => void
  onAddChild: (parentId: string) => void
  onToggleExpand: (id: string) => void
}

const BookmarkItem: React.FC<BookmarkItemProps> = ({
  bookmark,
  document,
  depth,
  onUpdate,
  onDelete,
  onAddChild,
  onToggleExpand,
}) => {
  const [editForm, setEditForm] = useState<BookmarkFormData>({
    title: bookmark.title || '',
    pageIndex:
      bookmark.target?.type === 'destination'
        ? bookmark.target.destination.pageIndex
        : 0,
    zoom:
      bookmark.target?.type === 'destination' &&
      bookmark.target.destination.zoom.mode === PdfZoomMode.XYZ
        ? bookmark.target.destination.zoom.params?.zoom
        : undefined,
  })

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: bookmark.id,
    data: { bookmark, depth },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleSave = () => {
    onUpdate(bookmark.id, {
      title: editForm.title,
      target: {
        type: 'destination',
        destination: {
          pageIndex: editForm.pageIndex,
          zoom: editForm.zoom
            ? {
                mode: PdfZoomMode.XYZ,
                params: { x: 0, y: 0, zoom: editForm.zoom },
              }
            : { mode: PdfZoomMode.FitPage },
          view: [],
        },
      },
      isEditing: false,
      isNew: false,
    })
  }

  const handleCancel = () => {
    if (bookmark.isNew) {
      onDelete(bookmark.id)
    } else {
      setEditForm({
        title: bookmark.title || '',
        pageIndex:
          bookmark.target?.type === 'destination'
            ? bookmark.target.destination.pageIndex
            : 0,
        zoom:
          bookmark.target?.type === 'destination' &&
          bookmark.target.destination.zoom.mode === PdfZoomMode.XYZ
            ? bookmark.target.destination.zoom.params?.zoom
            : undefined,
      })
      onUpdate(bookmark.id, { isEditing: false })
    }
  }

  const hasChildren = bookmark.children && bookmark.children.length > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group mb-2 rounded-lg border shadow-sm transition-all hover:shadow-md ${
        isDragging
          ? 'border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-900/30'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
    >
      <div
        className={`flex items-center ${depth > 0 ? `pl-${Math.min(depth * 4, 12)}` : ''}`}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-move p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Expand/Collapse */}
        {hasChildren && (
          <button
            onClick={() => onToggleExpand(bookmark.id)}
            className="flex-shrink-0 p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {bookmark.isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}
        {!hasChildren && <div className="w-6" />}

        {/* Content */}
        <div className="flex flex-1 items-center p-3">
          {bookmark.isEditing ? (
            <div className="flex flex-1 items-center gap-3">
              <input
                type="text"
                value={editForm.title}
                onChange={(e) =>
                  setEditForm({ ...editForm, title: e.target.value })
                }
                placeholder="Bookmark title"
                className="flex-1 rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-teal-400 dark:focus:ring-teal-400"
                autoFocus
              />
              <select
                value={editForm.pageIndex}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    pageIndex: parseInt(e.target.value),
                  })
                }
                className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-teal-400 dark:focus:ring-teal-400"
              >
                {Array.from({ length: document.pageCount }, (_, i) => (
                  <option key={i} value={i}>
                    Page {i + 1}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSave}
                className="rounded-md bg-green-100 p-1.5 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancel}
                className="rounded-md bg-gray-100 p-1.5 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4 flex-shrink-0 text-teal-600 dark:text-teal-400" />
              <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {bookmark.title || 'Untitled'}
              </span>
              {bookmark.target?.type === 'destination' && (
                <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  Page {bookmark.target.destination.pageIndex + 1}
                </span>
              )}
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => onUpdate(bookmark.id, { isEditing: true })}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onAddChild(bookmark.id)}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(bookmark.id)}
                  className="rounded-md p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && bookmark.isExpanded && (
        <div className="ml-8 border-l-2 border-gray-100 pl-2 dark:border-gray-700">
          <SortableContext
            items={(bookmark.children as EditableBookmark[]).map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {(bookmark.children as EditableBookmark[]).map((child) => (
              <BookmarkItem
                key={child.id}
                bookmark={child}
                document={document}
                depth={depth + 1}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}

export const BookmarkTree: React.FC<BookmarkTreeProps> = ({
  bookmarks,
  document,
  onChange,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const findBookmark = useCallback(
    (
      id: string,
      items: EditableBookmark[] = bookmarks,
    ): EditableBookmark | undefined => {
      for (const item of items) {
        if (item.id === id) return item
        if (item.children) {
          const found = findBookmark(id, item.children as EditableBookmark[])
          if (found) return found
        }
      }
    },
    [bookmarks],
  )

  const updateBookmarkInTree = useCallback(
    (
      id: string,
      updates: Partial<EditableBookmark>,
      items: EditableBookmark[] = bookmarks,
    ): EditableBookmark[] => {
      return items.map((item) => {
        if (item.id === id) {
          return { ...item, ...updates }
        }
        if (item.children) {
          return {
            ...item,
            children: updateBookmarkInTree(
              id,
              updates,
              item.children as EditableBookmark[],
            ),
          }
        }
        return item
      })
    },
    [bookmarks],
  )

  const deleteBookmarkFromTree = useCallback(
    (id: string, items: EditableBookmark[] = bookmarks): EditableBookmark[] => {
      return items
        .filter((item) => item.id !== id)
        .map((item) => {
          if (item.children) {
            return {
              ...item,
              children: deleteBookmarkFromTree(
                id,
                item.children as EditableBookmark[],
              ),
            }
          }
          return item
        })
    },
    [bookmarks],
  )

  const handleUpdate = useCallback(
    (id: string, updates: Partial<EditableBookmark>) => {
      onChange(updateBookmarkInTree(id, updates))
    },
    [onChange, updateBookmarkInTree],
  )

  const handleDelete = useCallback(
    (id: string) => {
      if (
        window.confirm(
          'Are you sure you want to delete this bookmark and all its children?',
        )
      ) {
        onChange(deleteBookmarkFromTree(id))
      }
    },
    [onChange, deleteBookmarkFromTree],
  )

  const handleAddChild = useCallback(
    (parentId: string) => {
      const newBookmark: EditableBookmark = {
        id: `new-${Date.now()}`,
        title: 'New Child Bookmark',
        parentId,
        target: {
          type: 'destination',
          destination: {
            pageIndex: 0,
            zoom: { mode: PdfZoomMode.FitPage },
            view: [],
          },
        },
        isEditing: true,
        isNew: true,
        isExpanded: true,
      }

      const addChildToTree = (
        items: EditableBookmark[],
      ): EditableBookmark[] => {
        return items.map((item) => {
          if (item.id === parentId) {
            const children = (item.children as EditableBookmark[]) || []
            return {
              ...item,
              children: [...children, newBookmark],
              isExpanded: true,
            }
          }
          if (item.children) {
            return {
              ...item,
              children: addChildToTree(item.children as EditableBookmark[]),
            }
          }
          return item
        })
      }

      onChange(addChildToTree(bookmarks))
    },
    [bookmarks, onChange],
  )

  const handleToggleExpand = useCallback(
    (id: string) => {
      handleUpdate(id, { isExpanded: !findBookmark(id)?.isExpanded })
    },
    [findBookmark, handleUpdate],
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const activeBookmark = findBookmark(active.id as string)
    const overBookmark = findBookmark(over.id as string)

    if (!activeBookmark || !overBookmark) return

    // Simple reordering at the same level
    const reorderBookmarks = (
      items: EditableBookmark[],
    ): EditableBookmark[] => {
      const activeIndex = items.findIndex((item) => item.id === active.id)
      const overIndex = items.findIndex((item) => item.id === over.id)

      if (activeIndex !== -1 && overIndex !== -1) {
        const newItems = [...items]
        const [removed] = newItems.splice(activeIndex, 1)
        newItems.splice(overIndex, 0, removed)
        return newItems
      }

      return items.map((item) => {
        if (item.children) {
          return {
            ...item,
            children: reorderBookmarks(item.children as EditableBookmark[]),
          }
        }
        return item
      })
    }

    onChange(reorderBookmarks(bookmarks))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-2">
        <SortableContext
          items={bookmarks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {bookmarks.map((bookmark) => (
            <BookmarkItem
              key={bookmark.id}
              bookmark={bookmark}
              document={document}
              depth={0}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onAddChild={handleAddChild}
              onToggleExpand={handleToggleExpand}
            />
          ))}
        </SortableContext>
      </div>

      <DragOverlay>
        {activeId ? (
          <div className="rounded-lg border border-indigo-300 bg-indigo-50 p-3 shadow-lg dark:border-indigo-700 dark:bg-indigo-900/80">
            <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
              {findBookmark(activeId)?.title || 'Bookmark'}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
