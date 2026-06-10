import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    envPrefix: ['VITE_', 'REACT_APP_'],
    build: {
        outDir: 'build',
        emptyOutDir: true
    },
    server: {
        port: 3000,
        proxy: {
            '^/(auth|emails|email|send|save|save-draft|starred|read|delete|bin|archive|move-to-label|sync|labels|contacts)': {
                target: 'http://localhost:8000',
                changeOrigin: true
            }
        }
    }
});
