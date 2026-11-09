import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    {
      name: 'sites-spa-fallback',
      apply: 'build',
      async writeBundle(options) {
        const output = options.dir ?? 'dist';
        await copyFile(resolve(output, 'index.html'), resolve(output, '404.html'));
      },
    },
  ],
});
