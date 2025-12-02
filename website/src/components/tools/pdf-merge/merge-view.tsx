'use client'

import React from 'react'
import { MergeDocPage } from './types'
import {
  useSensor,
  useSensors,
  PointerSensor,
  DragEndEvent,
  DndContext,
  closestCorners,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { SortablePage } from './sortable-page'
import { Button } from '../../button'

interface MergeViewProps {
  pages: MergeDocPage[]
  onDragEnd: (event: DragEndEvent) => void
  onRemovePage: (id: string) => void
  onMerge: () => void
  isMerging: boolean
}

export const MergeView: React.FC<MergeViewProps> = ({
  pages,
  onDragEnd,
  onRemovePage,
  onMerge,
  isMerging,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    }),
  )

  return (
    <div className="group relative">
      <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-700 opacity-10 blur transition duration-300 group-hover:opacity-20 dark:opacity-30"></div>
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-md dark:bg-gray-900">
        <div className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-700 shadow-sm">
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                New Document
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {pages.length} page{pages.length !== 1 ? 's' : ''} ready to
                merge
              </p>
            </div>
          </div>

          <div className="h-[460px] overflow-auto rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
            {pages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                    <svg
                      className="h-8 w-8 text-gray-400 dark:text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </div>
                  <h4 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                    No pages selected
                  </h4>
                  <p className="text-gray-500 dark:text-gray-400">
                    Select pages from source documents to add here
                  </p>
                </div>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                modifiers={[restrictToParentElement]}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={pages.map((p) => p.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 gap-3">
                    {pages.map((page, index) => (
                      <SortablePage
                        key={page.id}
                        page={page}
                        index={index}
                        isNew
                        onRemove={onRemovePage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              onClick={onMerge}
              className="rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-8 py-3 text-lg font-medium text-white transition-all duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:hover:shadow-green-900/20"
              disabled={pages.length === 0 || isMerging}
            >
              {isMerging ? 'Merging PDFs...' : 'Merge PDFs'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
