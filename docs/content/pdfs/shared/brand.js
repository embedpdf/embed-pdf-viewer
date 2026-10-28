/**
 * Which of ours a document is, for the welcome, the one document we build as each brand: the page
 * named by `?brand=` (EmbedPDF's without one) gives every element it marks `data-brand="<key>"`
 * that brand's value. Open `document.html?brand=cloudpdf` to see CloudPDF's pages; the build
 * prints each version that way. A classic script, since a module can't load from a file.
 */
(() => {
  const BRANDS = {
    embedpdf: {
      name: 'EmbedPDF',
      logo: 'embedpdf-logo.svg',
      tagline: ['Open source', 'PDF solutions'],
    },
    cloudpdf: {
      name: 'CloudPDF',
      logo: 'cloudpdf-logo.svg',
      tagline: ['Document platform', 'for modern apps'],
    },
  };

  const key = new URLSearchParams(location.search).get('brand') ?? 'embedpdf';
  const brand = BRANDS[key];
  if (!brand) throw new Error(`No brand '${key}' in shared/brand.js`);
  const shared = new URL('.', document.currentScript.src);

  for (const element of document.querySelectorAll('[data-brand]')) {
    switch (element.dataset.brand) {
      case 'name':
        element.textContent = brand.name;
        break;
      case 'logo':
        element.src = new URL(brand.logo, shared).href;
        element.alt = brand.name;
        break;
      case 'tagline':
        element.replaceChildren(brand.tagline[0], document.createElement('br'), brand.tagline[1]);
        break;
      case 'viewer':
        element.alt = `The ${brand.name} viewer`;
        break;
      default:
        throw new Error(`No brand value '${element.dataset.brand}' in shared/brand.js`);
    }
  }
})();
