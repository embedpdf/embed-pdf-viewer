import cn from 'clsx'
import Link from 'next/link'
import type { ComponentPropsWithoutRef, FC } from 'react'
import type { Url } from 'next/dist/shared/lib/router/router'
import { LinkArrowIcon } from 'nextra/icons'

export const EXTERNAL_URL_RE = /^https?:\/\//

type AnchorProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & {
  href?: Url
}

export const Anchor: FC<AnchorProps> = ({ href = '', ...props }) => {
  props = {
    ...props,
    className: cn('focus-visible:nextra-focus', props.className),
  }
  const hrefString = typeof href === 'string' ? href : href?.pathname || ''
  if (EXTERNAL_URL_RE.test(hrefString)) {
    const { children } = props
    return (
      <a href={hrefString} target="_blank" rel="noreferrer" {...props}>
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
  if (hrefString.startsWith('#')) {
    return <a href={hrefString} {...props} />
  }
  if (!href) {
    return <a href={hrefString} {...props} />
  }
  return <Link href={href} {...props} />
}
