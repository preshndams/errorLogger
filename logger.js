import fs from 'fs';
import rfs from 'file-stream-rotator';
import pino, { multistream } from 'pino';
import pretty from 'pino-pretty';
import { createWriteStream } from './pino-http-send.js';
import appConfig from './appConfig.js';
import path from 'path';

class Logger {
    createConfig = (config) => {
        const { prettyPrint, httpConfig, logging = {} } = config || appConfig;

        const loggingConfig = {
            postLevel: "error",
            stdout: true,
            logLevel: 'info',
            logFolder: './logs',
            mixin: null,
            ...logging
        };

        const prettyPrintConfig = {
            translateTime: 'SYS:yyyy-mm-dd h:MM:ss',
            ignore: '',
            colorize: false,
            singleLine: false,
            levelFirst: false,
            ...prettyPrint
        };

        return {
            loggingConfig,
            prettyPrintConfig,
            httpConfig: {
                method: 'post',
                retries: 0,
                ...httpConfig
            }
        };
    }

    createInstance = (config) => {
        const { httpConfig, loggingConfig, prettyPrintConfig } = this.createConfig(config);
        const { logFolder, logStreams = [], customLevels } = loggingConfig;
        const logLevel = loggingConfig.level || 'info';
        const streams = []

        const fileStreamConfigDefaults = {
            frequency: 'daily',
            max_logs: '10d',
            date_format: 'YYYY-MM-DD',
            size: null,
            extension: ".log",
            audit_file: path.join(logFolder, 'audit.json'),
        };

        function getPrettyStream(destination, level) {
            return {
                level,
                stream: pretty({
                    ...prettyPrintConfig,
                    destination: fs.createWriteStream(destination, { flags: 'a' }),  // File-based pretty logs
                    customLevels: customLevels
                }),
            };
        }


        if (!fs.existsSync(logFolder)) {
            fs.mkdirSync(logFolder);
        }

        for (const stream of logStreams) {
            //if log level is error then it will skipp the main stream only will log the error.
            if (logLevel === 'error' && stream.stream === "main") {
                continue;
            }
            // Create a pretty stream for each log file stream
            const logFileStream = rfs.getStream({ ...fileStreamConfigDefaults, ...stream });
            streams.push(getPrettyStream(logFileStream.fs.path, stream.logLevel));
        }

        if (loggingConfig.stdout !== false) {
            streams.push({ level: logLevel, stream: pretty({ ...prettyPrintConfig, destination: process.stdout, customLevels: customLevels, colorize: true }) });
        }

        if (httpConfig.url) {
            streams.push({
                level: loggingConfig.postLevel || "error",
                console: false,
                stream: createWriteStream(httpConfig),
            });
        }

        const logger = pino({
            level: logLevel || 'info', // this MUST be set at the lowest level of the destination
            customLevels,
            mixin: loggingConfig.mixin
        }, multistream(streams, { dedupe: true, levels: { ...pino.levels, ...customLevels } }));

        return logger;
    }
}

const logger = new Logger();

export { Logger };
export default logger;