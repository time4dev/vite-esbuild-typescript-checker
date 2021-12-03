import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePlugin }  from '../../dist';

export default defineConfig({
    plugins: [vue(), VitePlugin({
        vite: {
            overlay: true
        },
        checker: {
            typescript: {
                extensions: {
                    vue: {
                        enabled: true,
                        compiler: '@vue/compiler-sfc'
                    }
                }
            }
        }
    })]
})
