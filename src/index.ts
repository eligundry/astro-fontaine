import type { AstroIntegration } from 'astro'
import { FontaineTransform } from 'fontaine'
import * as csstree from 'css-tree'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'

export interface AstroFontaineOptions {
  fontDirectory?: string
  fallbackFonts: string[]
  remoteFontFaceStylesheetURLs?: string[]
}

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36'
const IE_UA = 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko'

const integration = (options: AstroFontaineOptions): AstroIntegration => {
  const {
    fontDirectory = './public/astro-fontaine',
    fallbackFonts,
    remoteFontFaceStylesheetURLs = [],
  } = options

  return {
    name: 'astro-fontaine',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript }) => {
        updateConfig({
          vite: {
            plugins: [
              FontaineTransform.vite({
                fallbacks: fallbackFonts,
                resolvePath: (id) =>
                  new URL(fontDirectory + id, import.meta.url),
              }),
            ],
          },
        })

        injectScript('page-ssr', `import 'astro-fontaine/generated.css';`)
      },
      'astro:config:done': async () => {
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
        const fontURLs = csstree
          .findAll(ast, (node, item, list) => node.type === 'Url')
          // @ts-ignore
          .map((node) => node.value)

        // Download all of the fonts to the app's public directory.
        // Fonts load the fastest when severed from the site's domain, as the
        // browser no longer does cross site caching and it'll save on
        // redundent request logic.
        await Promise.all(
          fontURLs.map(async (url) => {
            const parsedURL = new URL(url)
            const pathToSaveFont = path.join(
              fontDirectory,
              parsedURL.host,
              ...parsedURL.pathname.split('/')
            )

            // If we already have the font, skip downloading it.
            if (fs.existsSync(pathToSaveFont)) {
              return true
            } else {
              fs.mkdirSync(path.dirname(pathToSaveFont), { recursive: true })
            }

            const font = await fetch(url).then((resp) => {
              if (!resp.ok) {
                throw new Error(`Could not download font ${url}`)
              }

              if (!resp.body) {
                throw new Error(`Downloaded font is empty ${url}`)
              }

              return resp.body as ReadableStream<Uint8Array>
            })

            const stream = fs.createWriteStream(pathToSaveFont)
            await finished(Readable.fromWeb(font).pipe(stream))
          })
        )

        // Update the AST with the new font URLs
        csstree.walk(ast, (node) => {
          if (node.type === 'Url' && fontURLs.includes(node.value)) {
            node.value = node.value.replace('https://', '/astro-fontaine/')
          }
        })

        // Save the generated CSS to a stylesheet that Astro was instructed to
        // insert in the config step.
        fs.writeFileSync(
          path.join('.', 'node_modules', 'astro-fontaine', 'generated.css'),
          csstree.generate(ast),
          { flag: 'w' }
        )
      },
    },
  }
}

export default integration
