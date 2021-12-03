import { IssueCustom } from "./worker";
import { ErrorPayload, WebSocketServer } from "vite";
import { IssueWebpackError } from "fork-ts-checker-webpack-plugin/lib/issue/IssueWebpackError";
import chalk from "chalk";
import moment from "moment";
import process from "process";
import path from "path";
import fs from "fs";
import os from "os";
import { Worker } from "worker_threads";
import { BabelCodeFrameOptions } from "fork-ts-checker-webpack-plugin/lib/formatter";
import { codeFrameColumns } from "@babel/code-frame";
import { Issue } from "fork-ts-checker-webpack-plugin/lib/issue";
import { TypeScriptReporterOptions } from "fork-ts-checker-webpack-plugin/lib/typescript-reporter/TypeScriptReporterOptions";
import { EsLintReporterOptions } from "fork-ts-checker-webpack-plugin/lib/eslint-reporter/EsLintReporterOptions";

export type WorkerCallback = (err: any, result?: any) => any;
export type Formatter = (issue: Issue, options?: BabelCodeFrameOptions) => string;

export class Helper {
    public changedFiles: Array<string> = [];
    public deletedFiles: Array<string> = [];

    public timeout: NodeJS.Timeout | undefined = undefined;
    public worker: Worker | undefined;

    public config: PluginConfig;

    constructor(config: PluginConfig) {
        this.config = config;
        this.timeout = undefined;
        this.worker = undefined;
    }

    runWorker(path: string, cb: WorkerCallback, workerData: object | null = null) {
        const worker = new Worker(path, { workerData });

        worker.on('message', cb.bind(null, null));
        worker.on('error', cb);

        worker.on('exit', (exitCode) => {
            if (exitCode === 0) {
                return null;
            }

            return cb(new Error(`Worker has stopped with code ${exitCode}`));
        });

        return worker;
    }


    workerStart(ws?: WebSocketServer, watch: boolean = false) {
        this.config.checker.async = watch;
        this.worker = this.runWorker(path.resolve(__dirname, 'worker.js'), (err, message) => {
            if (err) {
                console.log(err);
                process.exit();
                return null;
            }

            this.handleMessage(message, ws)
        }, this.config.checker);

        this.worker.postMessage({
            type: 'changedFiles',
            files: { changedFiles: this.changedFiles, deletedFiles: this.deletedFiles }
        });
    }

    clearFiles() {
        this.changedFiles = [];
        this.deletedFiles = [];

        if (this.timeout) clearTimeout(this.timeout);
    }

    addFile = (path: string) => {
        if (!path.endsWith('.vue') && !path.endsWith('.ts') && !path.endsWith('.js')) return;

        if (this.changedFiles.indexOf(path) === -1) {
            this.changedFiles.push(path);

            if (this.timeout) clearTimeout(this.timeout);
            this.timeout = setTimeout(this.changeFiles.bind(this), 300);
        }
    }

    deleteFile = (path: string) => {
        if (!path.endsWith('.vue') && !path.endsWith('.ts') && !path.endsWith('.js') && !path.endsWith('vite.config.ts')) return;

        if (this.deletedFiles.indexOf(path) === -1) {
            this.deletedFiles.push(path);

            if (this.timeout) clearTimeout(this.timeout);
            this.timeout = setTimeout(this.changeFiles.bind(this), 300);
        }
    }

    changeFiles() {
        this.worker?.postMessage({
            type: 'changedFiles',
            files: { changedFiles: this.changedFiles, deletedFiles: this.deletedFiles }
        });

        this.clearFiles();
    }

    getPayloadError(issues: IssueCustom): ErrorPayload {
        return {
            type: 'error',
            err: issueToViteError(issues)
        };
    }

    handleMessage(message: any, ws?: WebSocketServer) {
        if (message.type === 'issueList') {
            const issues = message.issues.map((issue: IssueCustom) => {
                issue.formatted = createCodeFrameFormatter({
                    highlightCode: false,
                    forceColor: false
                })(issue);

                issue.formattedColor = createCodeFrameFormatter({
                    highlightCode: true
                })(issue);

                const error = new IssueWebpackError(issue.formattedColor, issue);

                console.log([
                    chalk.red(`ERROR in ${error.file}`),
                    `${error.message}`
                ].join("\n"));

                return issue;
            });

            if (ws && issues[0] && this.config.vite.overlay) {
                ws.send(this.getPayloadError(issues[0]));
            }

            if (issues.length) console.log(chalk.red(`[${moment().format('Y-MM-DD H:mm:ss')}] Found ${issues.length} errors.`));
            console.log(chalk.green(`[${moment().format('Y-MM-DD H:mm:ss')}] Types check done in ${message.time}ms.`));
        }
    }
}

export function issueToViteError(
    issue: IssueCustom
): ErrorPayload['err'] {
    let loc: ErrorPayload['err']['loc']
    if (issue.location) {
        loc = {
            file: issue.file,
            line: issue.location.start.line,
            column: issue.location.start.column ?? 0,
        }
    }

    return {
        message: issue.formatted ?? '',
        stack: "",
        id: issue.file,
        frame: 'issue.stripedCodeFrame',
        plugin: `fork-ts-checker-vite-plugin`,
        loc,
    }
}

export function createCodeFrameFormatter(options?: BabelCodeFrameOptions): Formatter {
    const basicFormatter = createBasicFormatter();

    return function codeFrameFormatter(issue) {
        const source = issue.file && fs.existsSync(issue.file) && fs.readFileSync(issue.file, 'utf-8');

        let frame = '';
        if (source && issue.location) {
            frame = codeFrameColumns(source, issue.location, {
                highlightCode: true,
                ...(options || {}),
            })
                .split('\n')
                .map((line: string) => '  ' + line)
                .join(os.EOL);
        }

        const lines = [basicFormatter(issue, {
            highlightCode: true,
            ...(options || {}),
        })];
        if (frame) {
            lines.push(frame);
        }

        return lines.join(os.EOL);
    };
}

export function createBasicFormatter(): Formatter {
    return function basicFormatter(issue, options?: BabelCodeFrameOptions) {
        return (options?.highlightCode ? chalk.grey(issue.code + ': ') : issue.code + ': ') + issue.message;
    };
}

export interface PluginConfig {
    vite: {
        overlay: boolean
    },
    checker: ForkTsCheckerWebpackPluginOptions
}

export interface ForkTsCheckerWebpackPluginOptions {
    async?: boolean;
    typescript?: TypeScriptReporterOptions;
    eslint?: EsLintReporterOptions;
    formatter?: 'codeframe' | 'basic';
}
