import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  assetsInclude: ['**/*.onnx'], // This tells Vite to include .onnx files as assets
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@ricky0123/vad/dist/vad.worklet.js',
          dest: 'src',
        },
        {
          src: 'node_modules/@ricky0123/vad/dist/*.onnx',
          dest: 'src',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: 'assets/onnxruntime',
        },
      ],
    }),
  ],
});
