import cn from 'clsx'
import type { ComponentProps, FC } from 'react'

const Table_: FC<ComponentProps<'table'>> = (props) => (
  <table {...props} className={cn('block overflow-x-auto', props.className)} />
)
const Th: FC<ComponentProps<'th'>> = (props) => {
  return (
    <th
      {...props}
      className={cn(
        'm-0 border border-gray-300 px-4 py-2 font-semibold dark:border-gray-700 dark:text-gray-100',
        props.className,
      )}
    />
  )
}
const Tr: FC<ComponentProps<'tr'>> = (props) => {
  return (
    <tr
      {...props}
      className={cn(
        'm-0 border-t border-gray-300 p-0 dark:border-gray-700',
        'even:bg-gray-100 dark:even:bg-gray-800/50',
        props.className,
      )}
    />
  )
}
const Td: FC<ComponentProps<'td'>> = (props) => {
  return (
    <td
      {...props}
      className={cn(
        'm-0 border border-gray-300 px-4 py-2 dark:border-gray-700 dark:text-gray-300',
        props.className,
      )}
    />
  )
}

export const Table = Object.assign(Table_, {
  Th,
  Tr,
  Td,
})
