import path from "path"
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  plugins: [vue(), Icons()],
  build: {
    minify: 'oxc',
    rolldownOptions: {
      input: {
        main: './index.html',
        desktopLyric: './desktop-lyric.html',
        miniPlayer: './mini-player.html'
      },
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        minify: {
          compress: { dropConsole: true }
        },
        codeSplitting: {
          minSize: 10 * 1024,
          groups: [
            { test: /node_modules\/vue/, name: 'vue' },
            { test: /node_modules\/vue-router/, name: 'vue-router' },
            { test: /node_modules\/pinia/, name: 'pinia' },
            { test: /node_modules\/@vueuse/, name: 'vueuse' }
          ]
        }
      }
    }
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**']
    }
  }
})
