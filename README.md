# astro-fontaine

This is an Astro plugin that will automatically generate fallback fonts for the web fonts in your site to prevent CLS
using the wonderful [fontaine](https://github.com/danielroe/fontaine) library.

It does the following:

1. Downloads provided font stylesheets.
2. Parses and extracts all `@font-face` definitions.
3. Downloads the fonts to your site's `public` directory and rewrites the stylesheet to use the fonts hosted on your
   site's domain.
4. Generates fallback fonts.
5. Inlines the rewritten font stylesheets and fallback `@font-face` declarations into all pages in your site's build.

## Usage

Add this code to your `astro.config.js`:

```javascript
import { defineConfig } from 'astro/config'
import fontaine from 'astro-fontaine'

export default defineConfig({
  integrations: [
    fontaine({
      // If you are using Google Fonts, Typekit or some other font hosting service, you can provide the URL to the
      // stylesheet here and the plugin will download and inline it into your webpages automatically.
      remoteFontFaceStylesheetURLs: [
        'https://fonts.googleapis.com/css2?family=Arvo:ital,wght@0,400;0,700;1,400;1,700&family=Fira+Code&family=Lato:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900&display=fallback',
      ],
      // Array of font families that will be used to generate the fallback fonts
      fonts: [
        {
          family: 'Arvo',
          // You can provide fallbacks per fronts such that the fallback font is of the same style when it flashes.
          fallbacks: ['Georgia', 'Cambria'],
        },
        // If you omit fallbacks, the defaultFallbacks property will be used.
        { family: 'Lato' },
        {
          family: 'Fira Code',
          fallbacks: [
            'SFMono-Regular',
            'Menlo',
            'Monaco',
            'Consolas',
            'Liberation Mono',
            'Courier New',
            'monospace',
          ],
        },
      ],
      defaultFallbacks: [
        'ui-sans-serif',
        'Helvetica Neue',
        'Arial',
        'sans-serif',
      ],
    }),
  ]
})
```

## Inspiration

This library borrows heavily from the following libraries and would not exist without them:

* [danielroe/fontaine](https://github.com/danielroe/fontaine)
* [dc7290/astro-fonts-next](https://github.com/dc7290/astro-fonts-next)
* [nuxt-modules/fontaine](https://github.com/nuxt-modules/fontaine)
