import fs from 'fs';
import rfs from 'file-stream-rotator';
import pino, { multistream } from 'pino';
import pretty from 'pino-pretty';
import { createWriteStream } from './pino-http-send.js';
import path from 'path';

class Logger {
    static readConfig(configFiles) {
        const config = {};

        configFiles.forEach((file) => {
            if (fs.existsSync(file)) {
                const fileData = fs.readFileSync(file, 'utf-8');
                Object.assign(config, JSON.parse(fileData));
            }
        });
        return config;
    };

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

    /**
     * 
     * @param {*} config Array of config files to read config from, or configuration. If empty, defaults to config from logger.config.json and logger.config.local.json
     * @returns {Object} pino-logger
     */
    constructor(config) {
        if (!config) {
            config = Logger.readConfig(['./logger.config.json', './logger.config.local.json']);
        } else if (Array.isArray(config)) {
            config = Logger.readConfig(config);
        }
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
            streams.push({
                level: stream.stream === "main" ? logLevel : stream.logLevel, //Added this condition here to validate the other level like info, debug, warn etc in the main stream.
                stream: pretty({
                    ...prettyPrintConfig,
                    destination: fs.createWriteStream(logFileStream.fs.path, { flags: 'a' }),  // File-based pretty logs
                    customLevels
                })
            });
        }

        if (loggingConfig.stdout !== false) {
            streams.push({
                level: logLevel,
                stream: pretty({
                    ...prettyPrintConfig,
                    destination: process.stdout,
                    customLevels: customLevels,
                    colorize: true
                })
            });
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

export const logger = new Logger();
export default Logger;