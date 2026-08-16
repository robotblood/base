# Vendored typefaces

Font binaries for the font library, served from `/typefaces/…`. They live here
rather than being pulled from a foundry at runtime for the same reason the UI
families are bundled through `@fontsource` (see `routes/layout.css`): the
dashboard has to work with no network, and a specimen that only renders online
isn't a specimen.

Only faces under a libre licence are vendored. Commercially licensed faces are
catalogued in `src/lib/design/typefaces.ts` **without** a file — `FontSpecimen`
renders them in its no-specimen state, which is the honest answer and also a
standing reminder of what a licence would cost.

| File | Family | Designer | Foundry | Licence |
| --- | --- | --- | --- | --- |
| `terminal_grotesque.woff2` | Terminal Grotesque | Raphaël Bastide | [Velvetyne](https://velvetyne.fr/fonts/terminal-grotesque/) | SIL OFL 1.1 |
| `terminal_grotesque_open.woff2` | Terminal Grotesque Open | Raphaël Bastide, jjjlllnnn | [Velvetyne](https://velvetyne.fr/fonts/terminal-grotesque/) | SIL OFL 1.1 |
| `pilowlava-regular.woff2` | Pilowlava | Anton Moglia, Jérémy Landes | [Velvetyne](https://velvetyne.fr/fonts/pilowlava/) | SIL OFL 1.1 |
| `pilowlava-atome.woff2` | Pilowlava Atome | Anton Moglia, Jérémy Landes | [Velvetyne](https://velvetyne.fr/fonts/pilowlava/) | SIL OFL 1.1 |
| `flor-de-ruina-semilla.woff2` | Flor de Ruina Semilla | Felipe Sanzana | [Velvetyne](https://velvetyne.fr/fonts/flor-de-ruina/) | SIL OFL 1.1 |
| `flor-de-ruina-germen.woff2` | Flor de Ruina Germen | Felipe Sanzana | [Velvetyne](https://velvetyne.fr/fonts/flor-de-ruina/) | SIL OFL 1.1 |
| `flor-de-ruina-flor.woff2` | Flor de Ruina Flor | Felipe Sanzana | [Velvetyne](https://velvetyne.fr/fonts/flor-de-ruina/) | SIL OFL 1.1 |
| `flor-de-ruina-fractura.woff2` | Flor de Ruina Fractura | Felipe Sanzana | [Velvetyne](https://velvetyne.fr/fonts/flor-de-ruina/) | SIL OFL 1.1 |
| `flor-de-ruina-ruina.woff2` | Flor de Ruina Ruina | Felipe Sanzana | [Velvetyne](https://velvetyne.fr/fonts/flor-de-ruina/) | SIL OFL 1.1 |

The SIL Open Font License permits redistribution of these files bundled with
software. It also requires the copyright notice and licence travel with them —
that is what this file is for. Full text: <https://openfontlicense.org>.

Faces sourced from `@fontsource` (Michroma, Archivo, Bricolage Grotesque) are
npm dependencies, not files here; their licence text ships inside each package.

When adding a face: drop the `.woff2` in, add a row above, declare it in
`src/lib/design/typefaces.css`, and register it in `typefaces.ts`.
