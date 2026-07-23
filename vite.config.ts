import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'

/**
 * The suite's sub-apps (synced into public/play, public/gym, public/review by
 * scripts/sync-apps.mjs, plus public/suite) are plain static apps. Serve them
 * directly from public/ ourselves:
 *  - /play -> 302 /play/ (so their relative asset paths resolve)
 *  - /play/ -> play/index.html
 *  - every file under those prefixes is read from disk with a proper MIME
 *    type, deterministically bypassing Vite's module pipeline (which 404s
 *    some classic <script src> requests, e.g. Sec-Fetch-Dest: script for
 *    files it tries to treat as modules).
 */
const SUITE_APPS = ['play', 'gym', 'review', 'puzzles']
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
  const handler = async (
    req: { url?: string },
    res: {
      statusCode: number
      setHeader: (k: string, v: string) => void
      end: (body?: Buffer | string) => void
    },
    next: () => void,
  ) => {
    const url = (req.url ?? '').split('?')[0]
    for (const app of SUITE_APPS) {
      if (url === `/${app}`) {
        res.statusCode = 302
        res.setHeader('Location', `/${app}/`)
        res.end()
        return
      }
    }
    const m = url.match(/^\/(play|gym|review|puzzles|suite)\/(.*)$/)
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
