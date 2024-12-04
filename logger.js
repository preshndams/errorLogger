import fs from 'fs';
import rfs from 'file-stream-rotator';
import pino, { multistream } from 'pino';
import pretty from 'pino-pretty';
import { createWriteStream } from './pino-http-send.js';
import { Transform } from "stream";
import path from 'path';

class PrettifyingRotatingStream extends Transform {
    constructor(rotatingStream) {
        super();
        this.rotatingStream = rotatingStream;
    }

    _transform(chunk, encoding, callback) {
        try {
            const logObject = JSON.parse(chunk.toString());
            const { level, time, msg, ...rest } = logObject;

            // Use Intl.DateTimeFormat to format time in 12-hour format with AM/PM
            const formatter = new Intl.DateTimeFormat("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true, // Ensures 12-hour format with AM/PM
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Ensures local PC timezone
            });

            const formattedTime = formatter.format(new Date(time));

            // Get the timezone abbreviation (e.g., IST, GMT)
            const timeZoneName = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
                .formatToParts(new Date(time))
                .find(part => part.type === 'timeZoneName').value;

            const timestamp = `${formattedTime} ${timeZoneName}`; // Combine time with timezone

            let prettyLog = `${level.toUpperCase()} [${timestamp}]: Message - ${msg}`;

            if (Object.keys(rest).length > 0) {
                const formattedRest = JSON.stringify(rest, null, 4); // 4-space indentation
                prettyLog += `\n\t${formattedRest}`;
            }

            prettyLog += "\n";
            this.rotatingStream.write(prettyLog);
            callback();
        } catch (error) {
            callback(error);
        }
    }
}

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
            colorize: false,
            singleLine: false,
            levelFirst: false,
            ignore: "pid,hostname",
            translateTime: "SYS:h:MM:ss TT Z o",
            messageFormat: "Message - {msg}",
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
        const { logFolder, logStreams = [], customLevels, showErrorsInMainStream = [] } = loggingConfig;
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
            const logFileStream = new PrettifyingRotatingStream(rfs.getStream({ ...fileStreamConfigDefaults, ...stream }));
            streams.push({
                level: stream.stream === "main" ? logLevel : stream.logLevel, //Added this condition here to validate the other level like info, debug, warn etc in the main stream.
                stream: logFileStream
            });

            //Including the errors in the main stream based on the other log level like info, debug, warn etc.
            if (showErrorsInMainStream.includes(logLevel) && stream.stream === "main") {
                streams.push({
                    level: 'error',
                    stream: streams[streams.length - 1].stream  // Reuse the same stream configuration
                });
            }
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
            if (logLevel !== 'error') {
                streams.push({
                    level: 'error',
                    stream: streams[streams.length - 1].stream  // Reuse the same stream configuration
                });
            }
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
            formatters: {
                level: (label) => {
                    return { level: label.toUpperCase() };
                }
            },
            mixin: loggingConfig.mixin
        }, multistream(streams, { dedupe: true, levels: { ...pino.levels, ...customLevels } }));

        return logger;
    }
}

export const logger = new Logger();
export default Logger;