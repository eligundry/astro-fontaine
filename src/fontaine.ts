import {
  generateFontFace,
  generateFallbackName,
  getMetricsForFamily,
  readMetrics,
} from 'fontaine'
import * as csstree from 'css-tree'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { createWriteStream } from 'node:fs'
import { finished } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import crypto from 'node:crypto'

interface Payload {
  href: string
  family: string
  fallbacks: string[]
  fontDirectory?: string
}

interface CustomFont {
  family: string
  fallbacks?: string[]
  src?: string
}

interface FontFromStylesheet extends CustomFont {
  src: string
}

function hashHref(href: string) {
  return `${crypto.createHash('md5').update(href).digest('hex')}.css`
}

async function getCachedCSS(
  href: string,
  fontDirectory: string
): Promise<string | undefined> {
  const key = hashHref(href)
  const cachedCssPath = path.join(fontDirectory, key)
  const fileExists = await checkIfFileExists(cachedCssPath)

  if (fileExists) {
    return fs.readFile(cachedCssPath, 'utf-8')
  }

  return undefined
}

async function cacheCSS(href: string, fontDirectory: string, css: string) {
  const key = hashHref(href)
  const cachedCssPath = path.join(fontDirectory, key)
  await fs.writeFile(cachedCssPath, css)
}

async function checkIfFileExists(file: string) {
  try {
    await fs.access(file, fs.constants.R_OK)
    return true
  } catch (e) {
    return false
  }
}

export async function generateCSS({
  href,
  fallbacks,
  fontDirectory = './public/astro-fontaine',
}: Payload): Promise<string> {
  const cachedCSS = await getCachedCSS(href, fontDirectory)

  if (cachedCSS) {
    return cachedCSS
  }

  // Download the stylesheet
  const stylesheet = await fetch(href).then((resp) => {
    if (!resp.ok) {
      throw new Error(`Could not fetch the following stylesheet URL: ${href}`)
    }

    return resp.text()
  })

  // Extract all of the font URLs
  const ast = csstree.parse(stylesheet)
  const fontFaceDeclarations: Array<FontFromStylesheet | CustomFont> = csstree
    .findAll(ast, (node, _item, _list) => {
      return node.type === 'Atrule' && node.name === 'font-face'
    })
    .map((ruleAst): FontFromStylesheet | null => {
      if (
        ruleAst.type !== 'Atrule' ||
        !ruleAst.block ||
        !ruleAst.block.children
      ) {
        return null
      }

      let family: string = ''
      let src: string = ''

      for (const node of ruleAst.block.children) {
        if (node.type === 'Declaration' && node.value.type === 'Value') {
          if (node.property === 'src') {
            // @ts-ignore
            src = node.value.children?.head?.data?.value?.trim()
          } else if (node.property === 'font-family') {
            // @ts-ignore
            family = node.value.children?.head?.data?.value?.trim()
          }
        }
      }

      if (!src || !family) {
        return null
      }

      return {
        family,
        src,
        fallbacks,
      }
    })
    .filter(Boolean)

  // Download all of the fonts to the app's public directory.
  // Fonts load the fastest when severed from the site's domain, as the
  // browser no longer does cross site caching and it'll save on
  // redundent request logic.
  await Promise.all(
    fontFaceDeclarations.map(async (fontFace) => {
      if (!fontFace.src) {
        return
      }

      const parsedURL = new URL(fontFace.src)
      const pathToSaveFont = path.join(
        fontDirectory,
        parsedURL.host,
        ...parsedURL.pathname.split('/')
      )
      const fileExists = await checkIfFileExists(pathToSaveFont)

      // If we already have the font, skip downloading it.
      if (fileExists) {
        return true
      }

      await fs.mkdir(path.dirname(pathToSaveFont), { recursive: true })

      const font = await fetch(fontFace.src).then((resp) => {
        if (!resp.ok) {
          throw new Error(`Could not download font ${fontFace.src}`)
        }

        if (!resp.body) {
          throw new Error(`Downloaded font is empty ${fontFace.src}`)
        }

        return resp.body as ReadableStream<Uint8Array>
      })

      const stream = createWriteStream(pathToSaveFont)
      // @ts-ignore
      await finished(Readable.fromWeb(font).pipe(stream))
    })
  )

  // Generate the font fallback metrics
  const fallbackFontsCSS = await Promise.all(
    fontFaceDeclarations
      // We only need to generate the fallback once per family, as style and
      // weight are not used in the fallback.
      .filter(
        (value, index, self) =>
          index === self.findIndex((f) => f.family === value.family)
      )
      .map(async (fontFace) => {
        let metrics = await getMetricsForFamily(fontFace.family)

        if (!metrics && fontFace.src) {
          const parsedURL = new URL(fontFace.src)
          const file = path.join(
            fontDirectory,
            parsedURL.host,
            ...parsedURL.pathname.split('/')
          )
          metrics = await readMetrics(pathToFileURL(file))
        }

        if (!metrics) {
          console.warn('Could not finde metrics for font', fontFace)
          return ''
        }

        return generateFontFace(metrics, {
          name: generateFallbackName(fontFace.family),
          fallbacks: fontFace.fallbacks,
        })
      })
  )

  // Update the AST with the new font URLs
  // In order to save on HTTP overhead, we serve the fonts from the same
  // hosts as the site.
  csstree.walk(ast, (node) => {
    if (
      node.type === 'Url' &&
      fontFaceDeclarations.find(({ src }) => src === node.value)
    ) {
      node.value = node.value.replace('https://', '/astro-fontaine/')
    }
  })

  const generatedCSS = csstree.generate(ast) + '\n' + fallbackFontsCSS

  await cacheCSS(href, fontDirectory, generatedCSS)

  return generatedCSS
}
