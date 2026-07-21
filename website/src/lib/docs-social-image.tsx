import { ImageResponse } from 'next/og';

import { getDocsPagePresentation, type DocsPagePresentation } from './docs-page';
import { FRAMEWORK_LABELS, type Framework } from './frameworks';

import { AngularIcon, ReactIcon, SvelteIcon, VueIcon } from '@/components/site/icons';

const FRAMEWORK_ACCENTS: Record<Framework, string> = {
  react: '#149ECA',
  vue: '#42B883',
  svelte: '#FF3E00',
  angular: '#DD0031',
};

const VARIANT_ACCENTS = {
  docs: '#1189FA',
  headless: '#0876FD',
  viewer: '#7C3AED',
} as const;

function FrameworkMark({ framework, size = 56 }: { framework: Framework; size?: number }) {
  if (framework === 'react') return <ReactIcon size={size} />;
  if (framework === 'vue') return <VueIcon size={size} />;
  if (framework === 'svelte') return <SvelteIcon size={size} />;
  return <AngularIcon size={size} />;
}

function BrandMark({ size }: { size: number }) {
  const offset = Math.round(size * 0.15);
  const square = size - offset;

  return (
    <div style={{ display: 'flex', height: size, position: 'relative', width: size }}>
      <div
        style={{
          backgroundColor: '#2CADF4',
          height: square,
          left: offset,
          position: 'absolute',
          top: 0,
          width: square,
        }}
      />
      <div
        style={{
          backgroundColor: '#23278A',
          bottom: 0,
          height: square,
          left: 0,
          position: 'absolute',
          width: square,
        }}
      />
      <div
        style={{
          backgroundColor: '#1189FA',
          height: square - offset,
          left: offset,
          position: 'absolute',
          top: offset,
          width: square - offset,
        }}
      />
    </div>
  );
}

function truncate(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1).trimEnd()}…`;
}

function SocialCard({ page }: { page: DocsPagePresentation }) {
  const accent = page.framework ? FRAMEWORK_ACCENTS[page.framework] : VARIANT_ACCENTS[page.variant];
  const titleSize = page.imageTitle.length > 56 ? 56 : page.imageTitle.length > 38 ? 64 : 72;
  const routeLabel = page.canonicalPath.replace(/^\//, '');

  return (
    <div
      style={{
        backgroundColor: '#F7F9FF',
        color: '#0A1A4D',
        display: 'flex',
        fontFamily: 'sans-serif',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      <div
        style={{
          backgroundImage: `linear-gradient(135deg, ${accent}22 0%, #9747FF12 58%, transparent 100%)`,
          borderRadius: 999,
          display: 'flex',
          height: 760,
          position: 'absolute',
          right: -310,
          top: -280,
          width: 760,
        }}
      />
      <div
        style={{
          backgroundColor: accent,
          display: 'flex',
          height: 8,
          left: 0,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: '58px 64px 52px',
          position: 'relative',
          width: 770,
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex' }}>
          <BrandMark size={46} />
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, marginLeft: 16 }}>
            EmbedPDF
          </div>
          <div
            style={{
              borderLeft: '2px solid #D9E2F3',
              color: '#607092',
              display: 'flex',
              fontSize: 24,
              fontWeight: 600,
              marginLeft: 18,
              paddingLeft: 18,
            }}
          >
            Docs
          </div>
        </div>

        <div style={{ alignItems: 'center', display: 'flex', marginTop: 62 }}>
          <div
            style={{
              color: accent,
              display: 'flex',
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            {page.section}
          </div>
          {page.framework ? (
            <div
              style={{
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                border: `1px solid ${accent}45`,
                borderRadius: 999,
                display: 'flex',
                marginLeft: 18,
                padding: '8px 15px 8px 11px',
              }}
            >
              <FrameworkMark framework={page.framework} size={25} />
              <div
                style={{
                  color: '#263760',
                  display: 'flex',
                  fontSize: 19,
                  fontWeight: 700,
                  marginLeft: 9,
                }}
              >
                {FRAMEWORK_LABELS[page.framework]}
              </div>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 800,
            letterSpacing: -2.5,
            lineHeight: 1.04,
            marginTop: 24,
            maxWidth: 680,
          }}
        >
          {truncate(page.imageTitle, 78)}
        </div>
        <div
          style={{
            color: '#52617F',
            display: 'flex',
            fontSize: 25,
            fontWeight: 500,
            lineHeight: 1.42,
            marginTop: 25,
            maxWidth: 680,
          }}
        >
          {truncate(page.socialDescription, 142)}
        </div>

        <div
          style={{
            alignItems: 'center',
            color: '#7784A0',
            display: 'flex',
            fontSize: 18,
            fontWeight: 600,
            marginTop: 'auto',
          }}
        >
          <div
            style={{
              backgroundColor: accent,
              borderRadius: 999,
              display: 'flex',
              height: 8,
              marginRight: 12,
              width: 8,
            }}
          />
          {truncate(routeLabel, 68)}
        </div>
      </div>

      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          height: '100%',
          justifyContent: 'center',
          paddingRight: 54,
          position: 'relative',
          width: 430,
        }}
      >
        <div
          style={{
            backgroundColor: '#08132D',
            border: '1px solid #24345A',
            borderRadius: 24,
            display: 'flex',
            flexDirection: 'column',
            height: 380,
            overflow: 'hidden',
            transform: 'rotate(2deg)',
            width: 350,
          }}
        >
          <div
            style={{
              alignItems: 'center',
              backgroundColor: '#0E1B3B',
              borderBottom: '1px solid #24345A',
              display: 'flex',
              height: 58,
              padding: '0 20px',
            }}
          >
            <div style={{ backgroundColor: '#FF6B6B', borderRadius: 99, height: 10, width: 10 }} />
            <div
              style={{
                backgroundColor: '#FFD166',
                borderRadius: 99,
                height: 10,
                marginLeft: 8,
                width: 10,
              }}
            />
            <div
              style={{
                backgroundColor: '#58D68D',
                borderRadius: 99,
                height: 10,
                marginLeft: 8,
                width: 10,
              }}
            />
            <div
              style={{
                color: '#8FA2C9',
                display: 'flex',
                fontSize: 15,
                fontWeight: 700,
                marginLeft: 'auto',
              }}
            >
              viewer.tsx
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '30px 25px',
              position: 'relative',
            }}
          >
            {[82, 63, 91, 72, 48].map((width, index) => (
              <div
                key={width}
                style={{
                  backgroundColor: index === 1 ? `${accent}CC` : '#33466F',
                  borderRadius: 99,
                  display: 'flex',
                  height: 9,
                  marginBottom: 17,
                  opacity: index === 1 ? 1 : 0.78,
                  width: `${width}%`,
                }}
              />
            ))}

            <div
              style={{
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                border: `5px solid ${accent}`,
                borderRadius: 18,
                bottom: -118,
                display: 'flex',
                height: 174,
                justifyContent: 'center',
                position: 'absolute',
                right: 25,
                transform: 'rotate(-5deg)',
                width: 138,
              }}
            >
              {page.framework ? (
                <FrameworkMark framework={page.framework} size={74} />
              ) : (
                <BrandMark size={72} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function createDocsSocialImage(mdxPath: string[]) {
  const page = await getDocsPagePresentation(mdxPath);
  if (!page) throw new Error(`Cannot create a social image for /${mdxPath.join('/')}.`);

  return new ImageResponse(<SocialCard page={page} />, {
    height: 630,
    width: 1200,
  });
}
