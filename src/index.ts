import type { AstroIntegration } from 'astro'
import {
  generateFontFace,
  generateFallbackName,
  getMetricsForFamily,
  readMetrics,
} from 'fontaine'
import * as csstree from 'css-tree'
import { load as cherrioLoad } from 'cheerio'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import { pathToFileURL, fileURLToPath } from 'node:url'

export interface CustomFont {
  family: string
  fallbacks?: string[]
  src?: string
}

interface FontFromStylesheet extends CustomFont {
  src: string
}

// A lot of this is stolen from these files
// https://github.com/nuxt-modules/fontaine/blob/main/src/module.ts
// https://github.com/dc7290/astro-fonts-next/blob/main/src/index.ts

export interface AstroFontaineOptions {
  fonts: CustomFont[]
  defaultFallbacks: string[]
  fontDirectory: string
  remoteFontFaceStylesheetURLs?: string[]
}

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36'

const integration = (options: AstroFontaineOptions): AstroIntegration => {
  const {
    fonts,
    defaultFallbacks,
    fontDirectory = './public/astro-fontaine',
    remoteFontFaceStylesheetURLs = [],
  } = options
  let buildFormat: 'file' | 'directory'

  return {
    name: 'astro-fontaine',
    hooks: {
      'astro:config:setup': ({ command, injectScript }) => {
        if (command === 'dev') {
          injectScript('page-ssr', `import 'astro-fontaine/generated.css';`)
        }
      },
      'astro:config:done': async ({ config }) => {
        buildFormat = config.build.format

        // Download all of the stylesheets
        const stylesheets = await Promise.all(
          remoteFontFaceStylesheetURLs.map(async (url) =>
            fetch(url, {
              headers: {
                'user-agent': CHROME_UA,
              },
            }).then((resp) => {
              if (!resp.ok) {
                throw new Error(
                  `Could not fetch the following stylesheet URL: ${url}`
                )
              }

              return resp.text()
            })
          )
        )

        // Extract all of the font URLs
        const ast = csstree.parse(stylesheets.join(''))
        const fontFaceDeclarations: Array<FontFromStylesheet | CustomFont> =
          csstree
            .findAll(ast, (node, item, list) => {
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
                if (
                  node.type === 'Declaration' &&
                  node.value.type === 'Value'
                ) {
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

              const providedFontDef = fonts.find((f) => f.family === family)

              return {
                family,
                src,
                fallbacks: providedFontDef?.fallbacks ?? defaultFallbacks,
              }
            })
            .filter((font): font is FontFromStylesheet => Boolean(font))

        fonts.forEach((font) => {
          if (!fontFaceDeclarations.find((ffd) => ffd.family === font.family)) {
            fontFaceDeclarations.push(font)
          }
        })

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

            // If we already have the font, skip downloading it.
            if ((await fs.stat(pathToSaveFont)).isFile()) {
              return true
            } else {
              await fs.mkdir(path.dirname(pathToSaveFont), { recursive: true })
            }

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
                fallbacks: fontFace.fallbacks ?? defaultFallbacks,
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

        // Save the generated CSS to a stylesheet that Astro was instructed to
        // insert in the config step.
        await fs.writeFile(
          path.join('.', 'node_modules', 'astro-fontaine', 'generated.css'),
          [csstree.generate(ast), ...fallbackFontsCSS].join('\n'),
          { flag: 'w' }
        )
      },

      'astro:build:done': async ({ pages, dir }) => {
        const cssFilePath = path.join(
          '.',
          'node_modules',
          'astro-fontaine',
          'generated.css'
        )
        const cssFile = (await fs.readFile(cssFilePath)).toString('utf-8')

        await Promise.all(
          pages.map(async ({ pathname }) => {
            let extensionWithPathname = ''

            if (pathname === '') {
              extensionWithPathname = 'index.html'
            } else if (pathname === '404/') {
              extensionWithPathname = '404.html'
            } else if (buildFormat === 'directory') {
              extensionWithPathname = path.join(pathname, 'index.html')
            } else {
              extensionWithPathname = pathname.replace(/\/$/, '') + '.html'
            }

            const filePath = path.join(
              fileURLToPath(dir),
              extensionWithPathname
            )
            const file = await fs.readFile(filePath, 'utf-8')

            const $ = cherrioLoad(file)

            // Font CSS
            if ($(`style[data-href="${cssFilePath}"]`).length === 0) {
              $('head').append(
                `<style data-href="${cssFilePath}">${cssFile}</style>`
              )
            }
            await fs.writeFile(filePath, $.html())
          })
        )
      },
    },
  }
}

export default integration
