const fs = require("fs");
const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");

const logsDir = "logs";

// Create the logs directory if it doesn't exist
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const dailyRotateTransport = new winston.transports.DailyRotateFile({
    filename: path.join(logsDir, "app-%DATE%.ndjson"), // logs/app-2026-02-04.log
    datePattern: "YYYY-MM-DD",
    zippedArchive: true, // compress old logs
    maxFiles: "14d", // keep logs for 14 days
    level: "info",
    format: winston.format.json(), // NDJSON-friendly
});

// Delete empty log files to avoid clutter
/**
 * Remove empty rotated log files so the logs directory does not fill up with noise.
 *
 * @returns {*}
 */
function deleteEmptyLogFiles() {
    try {
        fs.readdirSync("logs").forEach((file) => {
            const currentDate = new Date().toISOString().split("T")[0];
            if (fs.statSync(`logs/${file}`).size === 0 && !file.includes(currentDate)) {
                fs.unlinkSync(`logs/${file}`);
            }
        });
    } catch { }
}

// Will make good later. This is temporary I swear to god. Steven, fix it.

/**
 * Load the optional Seq transport only when the dependency is available.
 *
 * @returns {Promise<*>}
 */
async function loadSeqTransport() {
    const seqModule = await import("@datalust/winston-seq");
    return seqModule.SeqTransport;
}

// Create a new logger instance using the winston library
/**
 * Create the shared Winston logger used for app and request event logging.
 *
 * @returns {Promise<*>}
 */
async function createLogger() {
    deleteEmptyLogFiles();
    const SeqTransport = await loadSeqTransport();

    const transports = [];
    transports.push(dailyRotateTransport);

    if (process.env.SEQ_URL) {
        transports.push(
            new SeqTransport({
                level: "info",
                serverUrl: process.env.SEQ_URL,
            })
        );
    }

    return winston.createLogger({
        // This sets the format of the log messages.
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }), // include stack traces in errors
            winston.format.json()
        ),

        transports,
    });
}

// wrapper to log events
/**
 * Write a structured log event with the common Formbar event shape.
 *
 * @param {*} logger - logger.
 * @param {*} level - level.
 * @param {*} event - event.
 * @param {*} message - message.
 * @param {*} meta - meta.
 * @returns {*}
 */
function logEvent(logger, level, event, message = "", meta = {}) {
    logger.log({
        level: level,
        event: event,
        message: message,
        ...meta,
    });
}

let logger;
let loggerPromise;

// the singleton is a temporary solution hopefully.
/**
 * Return the singleton logger instance, creating it on first use.
 *
 * @returns {Promise<*>}
 */
async function getLogger() {
    if (!loggerPromise) {
        loggerPromise = createLogger();
    }

    logger = await loggerPromise;
    return logger;
}

module.exports = {
    getLogger,
    logEvent,
};
