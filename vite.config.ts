import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), {
    name: 'local-spreadsheet-preview',
    configureServer(server) {
      server.middlewares.use('/preview', (request, response, next) => {
        const file = request.url?.split('?')[0]
        const isCV = file === '/cv-profile.json'
        if (!isCV && file !== '/latest.json' && file !== '/snapshot-preview.json') return next()
        const profilePath = process.env.EDWARD_LOCAL_CV_PROFILE ?? '/tmp/edward-private-profile/edward-cv-profile.json'
        if (isCV) {
          const host = request.headers.host ?? ''
          const origin = request.headers.origin
          const isLoopback = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host) &&
            ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
          if (!isLoopback || (origin && origin !== 'http://' + host) ||
            ![undefined, 'same-origin'].includes(request.headers['sec-fetch-site']) ||
            request.headers['x-edward-preview'] !== 'cv') {
            response.statusCode = 404
            return response.end()
          }
        }
        const stream = createReadStream(isCV ? profilePath : fileURLToPath(new URL('./.preview' + file, import.meta.url)))
        stream.on('error', () => { response.statusCode = 404; response.end() })
        stream.on('open', () => {
          response.setHeader('Content-Type', 'application/json')
          if (isCV) response.setHeader('Cache-Control', 'no-store')
          stream.pipe(response)
        })
      })
    }
  }]
})
