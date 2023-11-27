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
      .toBe(`@font-face{font-family:"Inter";font-style:normal;font-weight:400;src:url(/astro-fontaine/fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2)format("woff2")}
@font-face {
  font-family: "Inter fallback";
  src: local("Helvetica");
  size-adjust: 100%;
  ascent-override: 96.875%;
  descent-override: 24.1477%;
  line-gap-override: 0%;
}

@font-face {
  font-family: "Inter fallback";
  src: local("Arial");
  size-adjust: 100%;
  ascent-override: 96.875%;
  descent-override: 24.1477%;
  line-gap-override: 0%;
}
`)
  })
})
