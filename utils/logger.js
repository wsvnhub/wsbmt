import winston from "winston";

const { combine, timestamp, json } = winston.format;

const logger = winston.createLogger({
    level: "info",
    format: combine(timestamp(), json()),
    transports: [
        new winston.transports.File({
            filename: "logs/app.log"
        }),
    ],
});


const errorLogger = winston.createLogger({
    level: "error",
    format: combine(timestamp(), json()),
    transports: [
        new winston.transports.File({
            filename: "logs/errors.log"
        }),
    ],
});

const larkLogger = winston.createLogger({
    level: "data",
    format: combine(timestamp(), json()),
    transports: [
        new winston.transports.File({
            filename: "logs/lark.log"
        }),
    ],
});


export { logger, errorLogger, larkLogger };
