import { LinkLayer } from '@embedpdf/react/link';

export const Links = () => (
  <LinkLayer
    renderLink={({ link, native }) => (
      <span className="pdf-link" title={link.target.kind === 'uri' ? link.target.uri : undefined}>
        {native}
      </span>
    )}
  />
);
