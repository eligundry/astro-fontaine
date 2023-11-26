import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { generateCSS } from './fontaine'

describe('generateCSS', () => {
  vi.mock('node:fs/promises')

  beforeEach(() => {
    fetchMock.resetMocks()
    vi.restoreAllMocks()
  })

  it('should return cached file if it exists', async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(void 0)
    vi.mocked(fs.readFile).mockResolvedValueOnce('body { color: red }')

    expect(
      await generateCSS({
        href: 'https://fonts.googleapis.com/css2?family=Inter',
        family: 'Inter',
        fallbacks: [],
      })
    ).toBe('body { color: red }')
  })

  it('should successfully parse and transform a @font-face stylesheet', async () => {
    fetchMock.mockResponseOnce(() => {
      return {
        body: `@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}`,
      }
    })

    expect(
      await generateCSS({
        href: 'https://fonts.googleapis.com/css2?family=Inter',
        family: 'Inter',
        fallbacks: ['Helvetica', 'Arial'],
      })
    )
      .toBe(`@font-face {font-family: 'Inter';font-style: normal;font-weight: 400;src: url(/astro-fontaine/fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2) format('woff2');unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}
@font-face {
  font-family: "Inter fallback";
  src: local("Helvetica");
  size-adjust: 100%;
  ascent-override: 96.875%;
  descent-override: 24.1477%;
  line-gap-override: 0%;
}
`)
  })
})
