import config from './appConfig.js';
import { SourceMapConsumer } from 'source-map-js';
import fs from 'fs';
import logger from './logger.js';
import path from 'path';

const { logging = {}, UiAppName } = config;
const { httpConfig } = logging || {};

class ErrorLogger {

    static _sourceMap = { source: null };

    static async init({ filePath }) {
        if (!filePath) {
            return;
        }
        try {
            const files = await fs.promises.readdir(filePath);
            const regex = /main\.\w+\.js\.map/;
            const matchingFile = files.find(file => regex.test(file));

            if (matchingFile) {
                const fileData = await fs.promises.readFile(path.join(filePath, matchingFile), 'utf-8');
                this._sourceMap.source = JSON.parse(fileData);
            }
        } catch (error) {
            logger.error({ err: error }, "Error while reading the source mapping file");
        }
    }

    static reMapStackWithSourceCode(stack, file) {
        if (!this._sourceMap[file]) {
            return stack;
        }

        let consumer;
        try {
            consumer = new SourceMapConsumer(this._sourceMap[file]);
            return stack.split('\n').map(line => {
                const match = line.match(/at\s+([^(]+)\((.*):(\d+):(\d+)\)/);
                if (!match) return line;

                const [, , , lineNum, columnNum] = match;
                const pos = consumer.originalPositionFor({
                    line: parseInt(lineNum, 10),
                    column: parseInt(columnNum, 10),
                });

                return pos.source
                    ? `${pos.source}:${pos.line}:${pos.column}${pos.name ? ' at ' + pos.name : ''}`
                    : line;
            }).join('\n');
        } catch {
            return stack;
        } finally {
            if (consumer?.destroy) {
                consumer.destroy();
            }
        }
    }

    static async execute(req, res) {
        const { appName, stack } = { ...req.body, ...req.query, ...req.params };
        const remappedStack = this.reMapStackWithSourceCode(stack, 'source');
        if (!httpConfig.url) {
            logger.clienterror({ err: { stack: remappedStack } }, "Client-side error: An issue occurred while processing the request.");
        } else {
            const logData = {
                req: { ...req, headers: req.headers, body: {} },
                err: { stack: remappedStack },
                machineName: appName.toLowerCase() || '',
                rawUrl
            };
            req.log.error(logData);
            res.status(200).send('Mail Sent');
        }
        return true;
    }
}
}

export default ErrorLogger;