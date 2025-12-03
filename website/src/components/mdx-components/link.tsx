import cn from 'clsx'
import NextLink from 'next/link'
import { Anchor } from './anchor'
import type { ComponentPropsWithoutRef, FC } from 'react'

type LinkProps = ComponentPropsWithoutRef<typeof NextLink>

export const Link: FC<LinkProps> = ({ className, ...props }) => {
  return (
    <Anchor
      className={cn(
        'text-primary-600 underline decoration-from-font [text-underline-position:from-font] hover:no-underline dark:text-primary-400',
        className,
      )}
      {...props}
    />
  )
}
