# astro-fontaine

This is an Astro plugin that will automatically generate fallback fonts for the web fonts in your site to prevent CLS
using the wonderful [fontaine](https://github.com/danielroe/fontaine) library.

It does the following:

1. Downloads the stylesheet.
2. Parses and extracts all `@font-face` definitions.
3. Downloads the fonts to your site's `public` directory and rewrites the stylesheet to use the fonts hosted on your
   site's domain.
4. Generates fallback fonts.
5. Inlines the rewritten font stylesheet and fallback `@font-face` declarations
   into a `<style>` element.

## Usage

In a `<head>` tag, add and configure the `<Fontaine />` component:

```astro
---
import { Fontaine } from 'astro-fontaine'
---

<!DOCTYPE html>
<html>
  <head>
    <Fontaine
      href="https://fonts.googleapis.com/css2?family=Arvo:ital,wght@0,400;0,700;1,400;1,700&display=fallback"
      family="Arvo"
      fallbacks={['Georgia', 'Cambria']}
    />
    <Fontaine
      href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900&display=fallback"
      family="Lato"
      fallbacks={['Helvetica Neue', 'Arial', 'sans-serif']}
    />
    <Fontaine
      href="https://fonts.googleapis.com/css2?family=Fira+Code&display=fallback"
      family="Fira Code"
      fallbacks={[
        'SFMono-Regular',
        'Menlo',
        'Monaco',
        'Consolas',
        'Liberation Mono',
        'Courier New',
        'monospace',
      ]}
    />
  </head>
</html>
```

## Inspiration

This library borrows heavily from the following libraries and would not exist without them:

* [danielroe/fontaine](https://github.com/danielroe/fontaine)
* [dc7290/astro-fonts-next](https://github.com/dc7290/astro-fonts-next)
* [nuxt-modules/fontaine](https://github.com/nuxt-modules/fontaine)
