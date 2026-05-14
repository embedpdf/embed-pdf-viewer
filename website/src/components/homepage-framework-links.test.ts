import assert from 'node:assert/strict'
import test from 'node:test'

import { getButtonText, getDocumentationLink } from './homepage-framework-links'

test('getDocumentationLink returns the Angular viewer introduction docs route', () => {
  assert.equal(
    getDocumentationLink('angular'),
    '/docs/angular/viewer/introduction',
  )
})

test('getButtonText returns the Angular documentation CTA copy', () => {
  assert.equal(getButtonText('angular'), 'Read Angular Documentation')
})

test('homepage framework link helpers throw for unexpected frameworks', () => {
  assert.throws(
    () =>
      getDocumentationLink(
        'ember' as unknown as import('./code-showcase').Framework,
      ),
    /Unsupported framework: ember/,
  )

  assert.throws(
    () =>
      getButtonText('ember' as unknown as import('./code-showcase').Framework),
    /Unsupported framework: ember/,
  )
})
