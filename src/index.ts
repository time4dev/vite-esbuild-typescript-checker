import {Helper, PluginConfig} from "./helper";
import {OnLoadArgs, Plugin} from "esbuild";
import chalk from "chalk";
import moment from "moment";

import {ViteDevServer} from "vite";

export function VitePlugin(config?: PluginConfig) {
    const defaultConfig = {
        vite: {
            overlay: false
        },
        checker: {
            async: true
        }
    }

    const pluginConfig = Object.assign({}, defaultConfig, config);
    const helper = new Helper(pluginConfig);

    return {
        name: 'vite-plugin-fork-ts-checker',
        configureServer({watcher, ws, config: {logger}}: ViteDevServer) {
            helper.workerStart(ws, true);

            watcher.on('add', helper.addFile)
            watcher.on('change', helper.addFile)
            watcher.on('unlink', helper.deleteFile)
        },
        async writeBundle(options: any) {
            pluginConfig.checker.async = false;
            helper.workerStart(undefined, false);
        },
    }
}


export const EsbuildPlugin = (config: PluginConfig): Plugin => {
    return {
        name: 'esbuild-plugin-fork-ts-checker',
        setup(build: any) {
            const defaultConfig = {
                checker: {
                    async: true
                }
            }

            const pluginConfig = Object.assign({}, defaultConfig, config);
            const helper = new Helper(pluginConfig);

            const options = build.initialOptions;

            build.onEnd((result: any) => {
                console.log(chalk.blue(`[${moment().format('Y-MM-DD H:mm:ss')}] Build ended with ${result.errors.length} errors`))
                if (!result.errors.length && !helper.worker) {
                    helper.workerStart(undefined, !!options.watch);
                }
            });

            build.onLoad({filter: /\.jsx?|\.tsx?$/}, async (args: OnLoadArgs) => helper.worker ? helper.addFile(args.path) : undefined)
        }
    }
}
