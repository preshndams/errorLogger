import { SourceMapConsumer } from 'source-map-js';
import fs from 'fs';
import Logger from './logger.js';
import path from 'path';

class ErrorMapper {

    static _sourceMap = { source: null };

    /**
     * Initializes the source map by locating and loading a matching JavaScript or source map file
     * from the specified directory based on the given file name.
     *
     * The method looks for files matching the pattern:
     * `${fileName}[.hash].js[.map]` (e.g., `main.js`, `main.123abc.js.map`, etc.)
     *
     * If a matching `.js.map` file is found, its contents are read and parsed into `_sourceMap.source`.
     * If the directory does not exist or no matching file is found, it logs a warning.
     *
     * @param {Object} options - Options for initialization.
     * @param {string} options.filePath - Absolute or relative path to the directory containing script files.
     * @param {string} options.fileName - Base name of the file to match (e.g., 'main', 'index').
     * @returns {Promise<void>} Resolves when the process is complete or aborted due to missing files.
     */
    static async init({ filePath }) {
        const logger = new Logger();
        if (!fs.existsSync(filePath)) {
            logger.warn("Script files are not available for loading the source map in the frontend build.");
            return;
        }
        try {
            const files = await fs.promises.readdir(filePath);
            const matchingFile = files.find(file => file.endsWith('.js.map'));
            if (matchingFile) {
                const fileData = await fs.promises.readFile(path.join(filePath, matchingFile), 'utf-8');
                this._sourceMap.source = JSON.parse(fileData);
            }
        } catch (error) {
            logger.error({ err: error }, "Error while reading the source mapping file");
        }
    }

    /**
     * Remaps a stack trace using source maps to provide original file names, line numbers, 
     * and column numbers from the source code. This function uses SourceMapConsumer to 
     * convert transpiled stack traces back to their original source locations, making debugging easier.
     *
     * @param {string} stack - The error stack trace from the frontend, typically from a minified build.
     * @param {string} file - The filename or key associated with the source map.
     * @returns {string} - The remapped stack trace with source code locations.
     */
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

    /**
     * Handles client-side error logging and response in case of frontend build errors.
     * - Extracts app name and error stack from request body, query, or parameters.
     * - Uses source map to remap stack trace for improved traceability (file name/line number).
     * - Logs client error details, either to an external logging service or locally, 
     *   depending on configuration.
     * - Sends a confirmation response to the client after logging.
     *
     * @param {Object} req - The HTTP request object containing error details from the frontend.
     * @param {Object} res - The HTTP response object for sending back confirmation to the client.
     * @returns {boolean} - Returns true if the error was successfully logged.
     */
    static async execute(req, res, logger = new Logger()) {
        const { appName = '', stack = '', rawUrl = '' } = { ...req.body, ...req.query, ...req.params };
        const remappedStack = this.reMapStackWithSourceCode(stack, 'source');
    
        if (logger.clienterror) {
            logger.clienterror({ err: { stack: remappedStack } }, 'Client-side error: An issue occurred while processing the request.');
        } else {
            req.log.error({
                req: { ...req, headers: req.headers, body: {} },
                err: { stack: remappedStack },
                machineName: appName.toLowerCase(),
                rawUrl
            });
            res.status(200).send('Mail Sent');
        }
    
        return true;
    }
}


export default ErrorMapper;