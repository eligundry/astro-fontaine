import { describe, it, expect, beforeEach, vi } from 'vitest'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
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
    ).toMatchSnapshot()
  })

  it('should remove `display=fallback` from Google Fonts URLs', async () => {
    fetchMock.mockResponseOnce((req) => {
      const parsed = new URL(req.url)
      expect(parsed.searchParams.get('display')).toBeFalsy()

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
        href: 'https://fonts.googleapis.com/css2?family=Inter&display=fallback',
        family: 'Inter',
        fallbacks: ['Helvetica', 'Arial'],
      })
    ).toMatchSnapshot()
  })

  it('should handle Typekit URLs', async () => {
    const stylesheetURL = 'https://use.typekit.net/foobar.css'
    const font = fsSync.readFileSync(
      path.join(__dirname, 'fixtures', 'font.woff2'),
      { encoding: 'binary' }
    )

    vi.mocked(fs.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    fetchMock.mockOnceIf(stylesheetURL, () => ({
      body: `
@font-face {
font-family:"Foobar";
src:url("https://use.typekit.net/fonts/xxxxxx/xxxxxxxxxxxxxxxxxxxxxxxx/xx/l?primer=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&fvd=n4&v=3") format("woff2"),url("https://use.typekit.net/fonts/xxxxx/xxxxxxxxxxxxxxxxxxxxxxxx/xx/d?primer=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&fvd=n4&v=3") format("woff"),url("https://use.typekit.net/fonts/bbbbbb/xxxxxxxxxxxxxxxxxxxxxxxx/xx/x?primer=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&fvd=n4&v=3") format("opentype");
font-display:auto;font-style:normal;font-weight:400;font-stretch:normal;
}
.tk-foobar { font-family: "Foobar",sans-serif; }
      `,
    }))

    fetchMock.mockIf(/^https:\/\/use.typekit.net\/fonts/, async () => {
      return {
        body: font.toString(),
      }
    })

    expect(
      await generateCSS({
        href: stylesheetURL,
        family: 'Foobar',
        fallbacks: ['Helvetica', 'Arial'],
      })
    ).toMatchSnapshot()
  })
})
