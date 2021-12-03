"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBasicFormatter = exports.createCodeFrameFormatter = exports.issueToViteError = exports.Helper = void 0;
const IssueWebpackError_1 = require("fork-ts-checker-webpack-plugin/lib/issue/IssueWebpackError");
const chalk_1 = __importDefault(require("chalk"));
const moment_1 = __importDefault(require("moment"));
const process_1 = __importDefault(require("process"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const worker_threads_1 = require("worker_threads");
const code_frame_1 = require("@babel/code-frame");
class Helper {
    changedFiles = [];
    deletedFiles = [];
    timeout = undefined;
    worker;
    config;
    constructor(config) {
        this.config = config;
        this.timeout = undefined;
        this.worker = undefined;
    }
    runWorker(path, cb, workerData = null) {
        const worker = new worker_threads_1.Worker(path, { workerData });
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
    workerStart(ws, watch = false) {
        this.config.checker.async = watch;
        this.worker = this.runWorker(path_1.default.resolve(__dirname, 'worker.js'), (err, message) => {
            if (err) {
                console.log(err);
                process_1.default.exit();
                return null;
            }
            this.handleMessage(message, ws);
        }, this.config.checker);
        this.worker.postMessage({
            type: 'changedFiles',
            files: { changedFiles: this.changedFiles, deletedFiles: this.deletedFiles }
        });
    }
    clearFiles() {
        this.changedFiles = [];
        this.deletedFiles = [];
        if (this.timeout)
            clearTimeout(this.timeout);
    }
    addFile = (path) => {
        if (!path.endsWith('.vue') && !path.endsWith('.ts') && !path.endsWith('.js'))
            return;
        if (this.changedFiles.indexOf(path) === -1) {
            this.changedFiles.push(path);
            if (this.timeout)
                clearTimeout(this.timeout);
            this.timeout = setTimeout(this.changeFiles.bind(this), 300);
        }
    };
    deleteFile = (path) => {
        if (!path.endsWith('.vue') && !path.endsWith('.ts') && !path.endsWith('.js') && !path.endsWith('vite.config.ts'))
            return;
        if (this.deletedFiles.indexOf(path) === -1) {
            this.deletedFiles.push(path);
            if (this.timeout)
                clearTimeout(this.timeout);
            this.timeout = setTimeout(this.changeFiles.bind(this), 300);
        }
    };
    changeFiles() {
        this.worker?.postMessage({
            type: 'changedFiles',
            files: { changedFiles: this.changedFiles, deletedFiles: this.deletedFiles }
        });
        this.clearFiles();
    }
    getPayloadError(issues) {
        return {
            type: 'error',
            err: issueToViteError(issues)
        };
    }
    handleMessage(message, ws) {
        if (message.type === 'issueList') {
            const issues = message.issues.map((issue) => {
                issue.formatted = createCodeFrameFormatter({
                    highlightCode: false,
                    forceColor: false
                })(issue);
                issue.formattedColor = createCodeFrameFormatter({
                    highlightCode: true
                })(issue);
                const error = new IssueWebpackError_1.IssueWebpackError(issue.formattedColor, issue);
                console.log([
                    chalk_1.default.red(`ERROR in ${error.file}`),
                    `${error.message}`
                ].join("\n"));
                return issue;
            });
            if (ws && issues[0] && this.config.vite.overlay) {
                ws.send(this.getPayloadError(issues[0]));
            }
            if (issues.length)
                console.log(chalk_1.default.red(`[${moment_1.default().format('Y-MM-DD H:mm:ss')}] Found ${issues.length} errors.`));
            console.log(chalk_1.default.green(`[${moment_1.default().format('Y-MM-DD H:mm:ss')}] Types check done in ${message.time}ms.`));
        }
    }
}
exports.Helper = Helper;
function issueToViteError(issue) {
    let loc;
    if (issue.location) {
        loc = {
            file: issue.file,
            line: issue.location.start.line,
            column: issue.location.start.column ?? 0,
        };
    }
    return {
        message: issue.formatted ?? '',
        stack: "",
        id: issue.file,
        frame: 'issue.stripedCodeFrame',
        plugin: `fork-ts-checker-vite-plugin`,
        loc,
    };
}
exports.issueToViteError = issueToViteError;
function createCodeFrameFormatter(options) {
    const basicFormatter = createBasicFormatter();
    return function codeFrameFormatter(issue) {
        const source = issue.file && fs_1.default.existsSync(issue.file) && fs_1.default.readFileSync(issue.file, 'utf-8');
        let frame = '';
        if (source && issue.location) {
            frame = code_frame_1.codeFrameColumns(source, issue.location, {
                highlightCode: true,
                ...(options || {}),
            })
                .split('\n')
                .map((line) => '  ' + line)
                .join(os_1.default.EOL);
        }
        const lines = [basicFormatter(issue, {
                highlightCode: true,
                ...(options || {}),
            })];
        if (frame) {
            lines.push(frame);
        }
        return lines.join(os_1.default.EOL);
    };
}
exports.createCodeFrameFormatter = createCodeFrameFormatter;
function createBasicFormatter() {
    return function basicFormatter(issue, options) {
        return (options?.highlightCode ? chalk_1.default.grey(issue.code + ': ') : issue.code + ': ') + issue.message;
    };
}
exports.createBasicFormatter = createBasicFormatter;
