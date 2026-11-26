# Ghost Run+: Landing site

How the public site is built and deployed. Part of [Ghost Run+](../README.md).

## Landing site

The landing page lives in `site/` (`@ghost-run/site`). Source: [site/](https://github.com/SungHyunC/ghost-run/tree/main/site) in the repository https://github.com/SungHyunC/ghost-run. It is deployed at https://ghost-run-plus.pages.dev (Cloudflare Pages, free plan). The deploy is a direct upload of `site/dist/` with `npx wrangler pages deploy site/dist --project-name ghost-run-plus --branch main`. Cloudflare Pages applies the root `_headers` file. One behavior to know: it redirects `/shell/ko.html` to `/shell/ko`.

Build it from the repository root:

```
corepack pnpm build:site
```

The command builds the three apps and the kit, assembles the result into `site/dist/`, and runs the site check. `site/dist/` holds the landing page at `/`, Ghost Shell at `/shell/`, Ghost Hand at `/hand/`, the kit showcase at `/kit/` and the kit gallery at `/kit/gallery/`.

The walkthrough in section 3 runs live in the browser with the same engines as the apps: Ghost Shell and Ghost Cloud run in the page (SQLite through `sql.js` in a Web Worker), and Ghost Hand runs the MuJoCo simulation in a worker. The Ghost Hand engine (about 11 MB of WebAssembly) loads only when Ghost Hand is picked, and a browser that cannot run the engines shows the recorded runs. Reality is a drawn copy that no run changes, and nothing leaves the page. Details and sizes: `docs/measurements.md`, section "Live walkthrough measurements".

The landing page at `/` has five pages with the hashes `#cover`, `#recipe`, `#costumes`, `#run`, and `#make`. `/kit/` is a showcase of the real UI kit, rendered with the gallery's sample data. The developer gallery is at `/kit/gallery/`.
