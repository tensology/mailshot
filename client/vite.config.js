import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
    target: 'http://localhost:8000',
    changeOrigin: true,
    bypass: (request) => {
        const acceptHeader = String(request.headers.accept || '').toLowerCase();
        const isBrowserNavigation = request.method === 'GET'
            && acceptHeader.includes('text/html')
            && !acceptHeader.includes('application/json');

        return isBrowserNavigation ? '/index.html' : undefined;
    }
};

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
            '^/(auth|emails|email|send|save|save-draft|starred|read|delete|bin|spam|archive|move-to-label|sync|settings|labels|contacts)': apiProxy
        }
    }
});
