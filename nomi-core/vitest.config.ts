import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        root: './',
        alias: {
            src: './src',
        },
    },
    plugins: [swc.vite()],
});
