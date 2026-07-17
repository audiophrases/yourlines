import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The suite's sub-apps (synced into public/play, public/gym, public/review by
 * scripts/sync-apps.mjs) are plain static apps with relative asset paths.
 * Serve /play -> redirect /play/ (so relative paths resolve) and
 * /play/ -> /play/index.html.
 */
const SUITE_APPS = ['play', 'gym', 'review']

function suiteApps(): Plugin {
  const handler = (req: { url?: string }, res: any, next: () => void) => {
    const url = (req.url ?? '').split('?')[0]
    for (const app of SUITE_APPS) {
      if (url === `/${app}`) {
        res.statusCode = 302
        res.setHeader('Location', `/${app}/`)
        res.end()
        return
      }
      if (url === `/${app}/`) {
        req.url = `/${app}/index.html`
        break
      }
    }
    next()
  }
  return {
    name: 'suite-apps',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), suiteApps()],
})
