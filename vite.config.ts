import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STUDIO_DEV_API_PORT, STUDIO_DEV_CLIENT_PORT } from './shared/default-ports.js'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (id.includes('@xyflow/react')) {
              return 'flow-vendor'
            }

            if (id.includes('@dnd-kit/')) {
              return 'dnd-vendor'
            }

            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor'
            }

            if (id.includes('@xterm/')) {
              return 'terminal-vendor'
            }

            if (
              id.includes('react-markdown') ||
              id.includes('remark-gfm') ||
              id.includes('rehype-highlight') ||
              id.includes('highlight.js')
            ) {
              return 'markdown-vendor'
            }

            if (id.includes('@opencode-ai/sdk') || id.includes('opencode-ai')) {
              return 'opencode-vendor'
            }

            if (id.includes('elkjs')) {
              return 'graph-vendor'
            }

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('scheduler')
            ) {
              return 'react-vendor'
            }

            if (id.includes('lucide-react')) {
              return 'icon-vendor'
            }

            return undefined
          },
        },
      },
    },
    server: {
      port: STUDIO_DEV_CLIENT_PORT,
      fs: {
        allow: [rootDir],
      },
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${STUDIO_DEV_API_PORT}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `ws://127.0.0.1:${STUDIO_DEV_API_PORT}`,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
