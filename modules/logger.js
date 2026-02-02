const fs = require("fs");
const winston = require("winston");
const path = require("path");

const logsDir = 'logs';

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

// Create a new logger instance using the winston library
function createLogger() {
    deleteEmptyLogFiles();

    return winston.createLogger({

        // This sets the format of the log messages.
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }), // include stack traces in errors
            winston.format.json()
        ),

        // This sets up the transports, which are the storage mechanisms for the logs
        transports: [
            new winston.transports.File({
                filename: path.join(logsDir, "app.log"),
            })
        ],
    });
}

// Create a new logger instance using the winston library
const logger = createLogger();

function logEvent(logger, level, event, message, meta = {}) {
    logger.log({
        level: level,
        event: event,
        message: message,
        ...meta
    });
}

/**
 * Gracefully exit after flushing logs.
 * @param {Error} error The error that caused the exit.
 */
async function handleExit(error) {
    if (error) {
        logger.error(error.stack || error.toString());
    }

    // Close Winston transports to ensure logs are written
    console.log("Flushing logs before exit...");
    logger.close();
}

// Catch uncaught exceptions
process.on("uncaughtException", async (err) => {
    console.error("Uncaught Exception:", err);
    await handleExit(err);
});

// Catch unhandled promise rejections
process.on("unhandledRejection", async (reason) => {
    console.error("Unhandled Promise Rejection:", reason);
    await handleExit(reason);
});

module.exports = {
    logger
};
