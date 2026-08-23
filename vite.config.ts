import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { suiteApps as suiteAppRegistry } from './scripts/suite-apps.mjs'

/**
 * The suite's sub-apps (synced into public/<name>/ by scripts/sync-apps.mjs,
 * plus public/suite) are plain static apps. Serve them directly from public/
 * ourselves:
 *  - /play -> 302 /play/ (so their relative asset paths resolve)
 *  - /play/ -> play/index.html
 *  - every file under those prefixes is read from disk with a proper MIME
 *    type, deterministically bypassing Vite's module pipeline (which 404s
 *    some classic <script src> requests, e.g. Sec-Fetch-Dest: script for
 *    files it tries to treat as modules).
 *
 * The names come from the same registry the sync and the deploy read, because
 * a list of them kept here as well is a list that goes stale: an app added to
 * the registry alone would build and publish fine and 404 in dev, which is the
 * one place nobody would think to look. The registry's argument is where the
 * sibling repos live, which matters to the sync and not at all to us.
 */
const SUITE_APPS = suiteAppRegistry(resolve(process.cwd(), '..')).map((a) => a.name)
const SUITE_PREFIXES = [...SUITE_APPS, 'suite']

const MIME: Record<string, string> = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function suiteApps(): Plugin {
  const publicDir = resolve(process.cwd(), 'public')
  // Populated via configResolved so this middleware works whether Vite is
  // serving from the origin root (dev) or a sub-path like /yourlines/
  // (preview of the production build, matching GitHub Pages).
  let base = '/'
  const handler = async (
    req: { url?: string },
    res: {
      statusCode: number
      setHeader: (k: string, v: string) => void
      end: (body?: Buffer | string) => void
    },
    next: () => void,
  ) => {
    let url = (req.url ?? '').split('?')[0]
    if (base !== '/') {
      if (!url.startsWith(base)) return next()
      url = '/' + url.slice(base.length)
    }
    for (const app of SUITE_APPS) {
      if (url === `/${app}`) {
        res.statusCode = 302
        res.setHeader('Location', `${base}${app}/`)
        res.end()
        return
      }
    }
    const m = url.match(/^\/([^/]+)\/(.*)$/)
    if (!m || !SUITE_PREFIXES.includes(m[1])) return next()
    let rel: string
    try {
      rel = m[2] === '' ? 'index.html' : decodeURIComponent(m[2])
    } catch {
      return next()
    }
    if (rel.includes('..') || rel.includes('\0')) {
      res.statusCode = 403
      res.end()
      return
    }
    try {
      const data = await readFile(join(publicDir, m[1], rel))
      res.statusCode = 200
      res.setHeader('Content-Type', MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream')
      res.end(data)
    } catch {
      next()
    }
  }
  return {
    name: 'suite-apps',
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages serves this project from /yourlines/ (a project page, not a
  // user/org root site or custom domain), so the production build — and
  // `vite preview`, which serves that same build — need asset and sub-app
  // URLs prefixed accordingly. `vite preview` reports command:'serve' (same
  // as dev), so `isPreview` is what actually distinguishes it from dev.
  // Dev itself stays at the origin root so local usage (incl. the suite
  // .bat launchers) is unaffected.
  base: command === 'build' || isPreview ? '/yourlines/' : '/',
  plugins: [react(), tailwindcss(), suiteApps()],
}))
