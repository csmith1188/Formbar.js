const fs = require("fs");
const winston = require("winston");
require('winston-daily-rotate-file');
const path = require("path");

const logsDir = 'logs';

const dailyRotateTransport = new winston.transports.DailyRotateFile({
    filename: path.join(logsDir, "app-%DATE%.ndjson"),   // logs/app-2026-02-04.log
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,               // compress old logs
    maxFiles: "14d",                   // keep logs for 14 days
    level: "info",
    format: winston.format.json(),     // NDJSON-friendly
});

// Delete empty log files to avoid clutter
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

async function loadSeqTransport() {
    const seqModule = await import("@datalust/winston-seq");
    return seqModule.SeqTransport;
}


// Create a new logger instance using the winston library
async function createLogger() {

    deleteEmptyLogFiles();
    const SeqTransport = await loadSeqTransport();

    return winston.createLogger({
        // This sets the format of the log messages.
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }), // include stack traces in errors
            winston.format.json()
        ),

        transports: [
            dailyRotateTransport,
            new SeqTransport({
                level: "info",
                serverUrl: process.env.SEQ_URL || "http://localhost:5341",
            }),
        ]
    });
}

// wrapper to log events
function logEvent(logger, level, event, message = "", meta = {}) {
    logger.log({
        level: level,
        event: event,
        message: message,
        ...meta
    });
}

module.exports = {
    createLogger,
    logEvent
};
