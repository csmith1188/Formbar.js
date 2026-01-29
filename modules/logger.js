const fs = require("fs");
const winston = require("winston");
const { logNumbers } = require("./config");
require("winston-daily-rotate-file");

// These are the levels that will be logged to the console
const loggingLevels = ["critical", "error", "warning"];

/**
 * Creates a new logger transport with a daily rotation.
 * This function creates a new daily rotating file transport for a given log level.
 *
 * @param {string} level - The level of logs to record.
 * @returns {winston.transports.DailyRotateFile} The created transport.
 */

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
        format: format.combine(
            format.timestamp(),
            format.errors({ stack: true }), // include stack traces in errors
            format.json()
        ),

        // This sets up the transports, which are the storage mechanisms for the logs
        transports: [
            new winston.transports.Console()
        ],
    });
}

// Create a new logger instance using the winston library
const logger = createLogger();

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
    logger,
};
