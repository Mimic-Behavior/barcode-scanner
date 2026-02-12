import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
    base: './',
    build: {
        copyPublicDir: false,
        lib: {
            entry: path.resolve(__dirname, 'src/lib/index.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            output: {
                assetFileNames(chunkInfo) {
                    return `${path.basename(chunkInfo.names[0], path.extname(chunkInfo.names[0])).replace('_', '-')}.[ext]`
                },
                entryFileNames: '[name].js',
            },
        },
    },
    plugins: [dts({ rollupTypes: true, tsconfigPath: './tsconfig.lib.json' })],
    server: {
        host: true,
    },
    worker: {
        format: 'es',
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
