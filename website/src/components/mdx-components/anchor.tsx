import cn from 'clsx'
import Link from 'next/link'
import type { ComponentPropsWithoutRef, FC } from 'react'
import { LinkArrowIcon } from 'nextra/icons'

export const EXTERNAL_URL_RE = /^https?:\/\//

export const Anchor: FC<ComponentPropsWithoutRef<'a'>> = ({
  href = '',
  ...props
}) => {
  props = {
    ...props,
    className: cn('focus-visible:nextra-focus', props.className),
  }
  if (EXTERNAL_URL_RE.test(href)) {
    const { children } = props
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
        {typeof children === 'string' && (
          <>
            &thinsp;
            <LinkArrowIcon
              // based on font-size
              height="1em"
              className="inline shrink-0 align-baseline"
            />
          </>
        )}
      </a>
    )
  }
  const ComponentToUse = href.startsWith('#') ? 'a' : Link
  return <ComponentToUse href={href} {...props} />
}
