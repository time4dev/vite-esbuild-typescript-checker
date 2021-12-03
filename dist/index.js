"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsbuildPlugin = exports.VitePlugin = void 0;
const helper_1 = require("./helper");
const chalk_1 = __importDefault(require("chalk"));
const moment_1 = __importDefault(require("moment"));
function VitePlugin(config) {
    const defaultConfig = {
        vite: {
            overlay: false
        },
        checker: {
            async: true
        }
    };
    const pluginConfig = Object.assign({}, defaultConfig, config);
    const helper = new helper_1.Helper(pluginConfig);
    return {
        name: 'vite-plugin-fork-ts-checker',
        configureServer({ watcher, ws, config: { logger } }) {
            helper.workerStart(ws, true);
            watcher.on('add', helper.addFile);
            watcher.on('change', helper.addFile);
            watcher.on('unlink', helper.deleteFile);
        },
        async writeBundle(options) {
            pluginConfig.checker.async = false;
            helper.workerStart(undefined, false);
        },
    };
}
exports.VitePlugin = VitePlugin;
const EsbuildPlugin = (config) => {
    return {
        name: 'esbuild-plugin-fork-ts-checker',
        setup(build) {
            const defaultConfig = {
                checker: {
                    async: true
                }
            };
            const pluginConfig = Object.assign({}, defaultConfig, config);
            const helper = new helper_1.Helper(pluginConfig);
            const options = build.initialOptions;
            build.onEnd((result) => {
                console.log(chalk_1.default.blue(`[${moment_1.default().format('Y-MM-DD H:mm:ss')}] Build ended with ${result.errors.length} errors`));
                if (!result.errors.length && !helper.worker) {
                    helper.workerStart(undefined, !!options.watch);
                }
            });
            build.onLoad({ filter: /\.jsx?|\.tsx?$/ }, async (args) => {
                if (helper.worker)
                    helper.addFile(args.path);
            });
        }
    };
};
exports.EsbuildPlugin = EsbuildPlugin;
