# Common Error Logger for Node.js Application

### Overview

This repository contains a common error logging solution built with Pino, designed to handle and map errors in both server and client applications. The logger supports multi-stream logging and enables error reporting via HTTP using pino-http. It is suitable for centralizing error handling in a Node.js environment with client-side error mapping and efficient logging.

### Features

- Pino-based Logging: Leverages Pino for high-performance logging.
- Multi-stream Logging: Logs can be written to multiple destinations, such as files, HTTP streams, or the console.
- Error Mapping: Supports client-side source map handling to map minified client errors back to original source files.
- HTTP Error Reporting: Directly sends error logs from any endpoint using pino-to-http for real-time monitoring.
- Custom Error Levels: Allows defining custom logging levels for more granular control over the logs.



### Logger config


```
{
    "logging": {
        "stdout": true,
        "level": "info",
        "logStreams": [
            {
                "stream": "main",
                "filename": "./logs/log-%DATE%",
                "logLevel": "info"
            },
            {
                "stream": "error",
                "filename": "./logs/log-%DATE%-error",
                "logLevel": "error"
            },
            {
                "stream": "error",
                "filename": "./logs/log-%DATE%-error",
                "logLevel": "clienterror"
            }
        ],
        "httpConfig": {
            "url": "http://localhost:3000/data",
            "headers": {
            }
        },
        "prettyPrint": {
            "colorize": false,
            "levelFirst": true,
            "ignore": "pid,hostname",
            "translateTime": "SYS:h:MM:ss TT Z o",
            "messageFormat": "Message - {msg}"
        },
        "customLevels": {
            "slow": 35,
            "clienterror": 70
1       }
    }
}
```

Mentioned the above logger configuration where we can modified our logger configuration based on the our application requirements like logs folder location, file name, custom levels, multple stream http configuration. 

#### How the config properties works

### logStreams:
Defines multiple log streams for different log levels (e.g., info, error). Each stream specifies a log file path and the log level it handles.

### otherConfig:
Additional settings such as sending logs to stdout and an optional HTTP configuration for remote logging. The httpConfig includes a URL and headers for the request.

### prettyPrint:
Configures how logs are formatted for human readability. Options include colorization, time formatting, and custom message formats.

### customLevels:
Defines custom log levels (slow, clienterror) with their respective numeric values. These are used in addition to standard log levels (e.g., info, error).
