# Mohith Dande — Portfolio

A single-page, scroll-driven portfolio: Cybersecurity × AI × Engineering.

It is plain HTML, CSS and JavaScript with no build step, no Node and no framework. Behind six editorial chapters (Intro, About, Builds, Stack, Journey and Contact) sits "Signal Core": one Three.js particle sculpture that re-forms itself for every chapter as you scroll. Every visual on the page is generated in code or SVG. There are no stock photos, and the page makes no requests to other sites, fonts included.

## Structure

```
index.html              page, SEO/OG tags, import map
style.css               tokens, layout, responsive, reduced-motion, print
script.js               scroll story, reveals, nav, mobile menu, case files, cursor
assets/js/world.js      Three.js world (morphing particle core, data ocean, quality tiers)
assets/vendor/three/    three.js r186 (MIT), vendored
assets/fonts/           Archivo + Martian Mono variable fonts (OFL), self-hosted
assets/projects/        procedural SVG visuals for the four builds
assets/icons/           favicon (SVG + PNG), apple-touch icon
assets/images/          og-image.png (1200×630 social preview)
```

Every path is relative (`./assets/...`), so the site works both at a domain root and under a GitHub Pages repository subpath such as `username.github.io/portfolio/`.

## Links

- GitHub: https://github.com/Mohith1-stack
- LinkedIn: https://www.linkedin.com/in/mohith-dande-01b58a371/
- Email: mohithdande3@gmail.com

These appear in the Contact section, the footer and the JSON-LD `sameAs` list in `index.html`.

## Projects

The Builds chapter shows four projects, each linked to its repository:

| # | Project | Repository |
| --- | --- | --- |
| 01 | Optimal-Truck | https://github.com/Mohith1-stack/Empty-truck |
| 02 | AEGIS | https://github.com/Mohith1-stack/Aegis-LLC |
| 03 | TraceSieve | https://github.com/Mohith1-stack/TraceSieve |
| 04 | SkillBridge AI | https://github.com/Mohith1-stack/AI-Powered-Freelance-Marketplace |

Their descriptions are written from each repository's README. To add a fifth project, copy one `<article class="build">` block, give it the next id (`build-05`) and add a matching SVG in `assets/projects/`. The page layout alternates automatically.

## Deploy to GitHub Pages

1. Create a repository and push the contents of this folder to it, with `index.html` at the repository root.
2. Open the repository's **Settings → Pages** page.
3. Under **Build and deployment**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
4. Wait for the Pages action to finish. The site appears at `https://<username>.github.io/<repo>/`, or at `https://<username>.github.io/` if the repository is named `<username>.github.io`.

An empty `.nojekyll` file is included so GitHub serves every file exactly as-is.

### Social preview (Open Graph)

Social platforms need an absolute URL for the preview image. After deploying, change these two tags in `index.html`:

```html
<meta property="og:image" content="https://<username>.github.io/<repo>/assets/images/og-image.png">
<meta name="twitter:image" content="https://<username>.github.io/<repo>/assets/images/og-image.png">
```

Add `<meta property="og:url" content="https://<username>.github.io/<repo>/">` and `<link rel="canonical" href="...">` with the same address.

## Run locally

ES modules do not load from `file://`, so serve the folder with any static server:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## The background world

`world.js` builds six forms from the same particles, and the page scroll scrubs between them:

| Chapter | Form |
| --- | --- |
| Intro | Globe with live routes out of Amritapuri and orbital rings |
| About | Five-layer network (Security → Data → Intelligence → Application → Impact) with signal flowing through it |
| Builds | Geodesic defence lattice around a protected core |
| Stack | Six stacked plates; each lights up while its skill group is being read |
| Journey | Rising double helix; the current milestone glows |
| Contact | Afterlight galaxy |

A wave-driven "data ocean" of points, a star field and a per-chapter sky gradient sit behind it. Each form holds still while its chapter is read and re-forms on the way to the next one. Camera framings, sky colours and brightness for each chapter live in the `SHOTS` array at the top of `world.js`.

## Performance and quality

- The whole world is 4 draw calls per frame: sky, stars, ocean and core. There are no textures, lights or post-processing, and all motion runs in vertex shaders, so JavaScript only updates a few uniforms per frame.
- The world reads the scroll position inside its own frame through `PortfolioState.progressAt()`, with a ~70 ms damped follow. It stays locked to the page without jitter from mouse-wheel steps.
- `world.js` picks a HIGH, MEDIUM or LOW preset from viewport width, pointer type, CPU core count and device memory. It then learns the display's refresh rate. If frames stay below it, it steps down on its own: resolution first, then particle count, then the ocean, and finally a still image.
- Rendering pauses when the tab is hidden, runs at half rate while a case file is open, and GPU resources are released when the page unloads. With the Data Saver setting on, the world renders one still composition per chapter.
- The film grain is a static layer, rasterised once.

To force a tier while testing, add it to the URL: `?quality=high`, `?quality=medium` or `?quality=low`.

## Accessibility

- The page uses semantic landmarks and has a skip link. All interactive controls can be reached with the keyboard and show visible focus rings.
- The mobile menu traps focus and closes with Escape. Case files use the native `<dialog>` element and return focus to the button that opened them.
- With `prefers-reduced-motion: reduce`, the world shows one still, fully formed composition per chapter instead of morphing, and scroll reveals are skipped. All content is still shown.
- If WebGL is unavailable or the context is lost, a static gradient replaces the world and the page works normally.
- The custom cursor only appears on devices with a fine pointer that can hover. It never intercepts scrolling or clicks.

## Editing content

All copy lives in `index.html`. Each project is an `<article class="build">`. The detailed text for its case file sits inside that article's hidden `.build__more` block, which the dialog reads when opened. To swap a project visual, replace the matching SVG in `assets/projects/` and keep the same file name, or update the `src` and `alt`.

## Credits

- three.js — MIT License (see `assets/vendor/three/LICENSE`)
- Archivo and Martian Mono — SIL Open Font License
