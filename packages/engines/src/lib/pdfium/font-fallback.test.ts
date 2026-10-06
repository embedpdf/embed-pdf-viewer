import { FontCharset } from '@embedpdf/models';
import { FontFallbackManager, type FontFallbackConfig } from './font-fallback';

describe('Latin font family fallback', () => {
  const config: FontFallbackConfig = {
    fonts: {
      [FontCharset.ANSI]: 'NotoSans-Regular.ttf',
      [FontCharset.SHIFTJIS]: 'NotoSansJP-Regular.otf',
    },
    fontFamilies: {
      serif: [
        { url: 'LiberationSerif-Regular.ttf', weight: 400 },
        { url: 'LiberationSerif-BoldItalic.ttf', weight: 700, italic: true },
      ],
      'sans-serif': 'LiberationSans-Regular.ttf',
      monospace: 'LiberationMono-Regular.ttf',
    },
    baseUrl: '/fonts',
  };

  function mappedUrl(face: string, charset = FontCharset.ANSI, weight = 400, italic = 0) {
    const manager = new FontFallbackManager(config);
    const handle = manager['mapFont'](weight, italic, charset, 0, face);
    return manager['fontHandles'].get(handle)?.url;
  }

  it.each([
    ['Times-Roman', '/fonts/LiberationSerif-Regular.ttf'],
    ['ABCDEF+TimesNewRoman', '/fonts/LiberationSerif-Regular.ttf'],
    ['Courier', '/fonts/LiberationMono-Regular.ttf'],
    ['Helvetica', '/fonts/LiberationSans-Regular.ttf'],
    ['Arial', '/fonts/LiberationSans-Regular.ttf'],
  ])('maps %s to %s', (face, url) => {
    expect(mappedUrl(face)).toBe(url);
  });

  it('uses the existing weight and italic variant selector', () => {
    expect(mappedUrl('Times-BoldItalic', FontCharset.DEFAULT, 700, 1)).toBe(
      '/fonts/LiberationSerif-BoldItalic.ttf',
    );
  });

  it('keeps the charset fallback for unfamiliar faces and non-Latin charsets', () => {
    expect(mappedUrl('Custom Face')).toBe('/fonts/NotoSans-Regular.ttf');
    expect(mappedUrl('Times-Roman', FontCharset.SHIFTJIS)).toBe('/fonts/NotoSansJP-Regular.otf');
  });

  it('keeps the charset fallback when no family mapping is configured', () => {
    const manager = new FontFallbackManager({ fonts: config.fonts });
    const handle = manager['mapFont'](400, 0, FontCharset.ANSI, 0, 'Times-Roman');
    expect(manager['fontHandles'].get(handle)?.url).toBe('NotoSans-Regular.ttf');
  });

  it('keeps the charset fallback when the requested family has no mapping', () => {
    const manager = new FontFallbackManager({
      fonts: config.fonts,
      fontFamilies: { serif: 'LiberationSerif-Regular.ttf' },
    });
    const handle = manager['mapFont'](400, 0, FontCharset.ANSI, 0, 'Courier');
    expect(manager['fontHandles'].get(handle)?.url).toBe('NotoSans-Regular.ttf');
  });
});
