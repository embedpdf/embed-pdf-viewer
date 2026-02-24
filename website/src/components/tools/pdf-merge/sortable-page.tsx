'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '../../button'
import { MergeDocPage } from './types'
import { X } from 'lucide-react'

interface SortablePageProps {
  page: MergeDocPage
  index: number
  isNew?: boolean
  onRemove?: (id: string) => void
}

export const SortablePage: React.FC<SortablePageProps> = ({
  page,
  index,
  isNew,
  onRemove,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: page.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative cursor-move rounded-lg border-2 border-gray-200 bg-white p-3 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
      {...attributes}
      {...listeners}
    >
      <div className="absolute right-3 top-3 z-10 flex items-center space-x-1">
        {onRemove && (
          <Button
            onPointerDown={(e) => {
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.stopPropagation()
              onRemove(page.id)
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100 dark:bg-red-600 dark:hover:bg-red-700"
            style={{ touchAction: 'none' }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {index + 1}
        </span>
      </div>
      {page.thumbnail ? (
        <img
          src={page.thumbnail}
          alt={`Page ${index + 1}`}
          className="h-full w-full rounded-md object-contain p-2 dark:opacity-90"
          style={{
            aspectRatio: '1/1.414',
          }}
        />
      ) : (
        <div
          className="flex w-full animate-pulse items-center justify-center rounded-md bg-gray-100 text-sm text-gray-400 dark:bg-gray-700/50 dark:text-gray-500"
          style={{
            aspectRatio: '1/1.414',
          }}
        >
          Loading...
        </div>
      )}
    </div>
  )
}
