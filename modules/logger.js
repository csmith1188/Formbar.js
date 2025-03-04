const fs = require("fs")
const winston = require("winston")
const dailyfile = require('winston-daily-rotate-file');
const { logNumbers } = require("./config");

/**
 * Creates a new logger transport with a daily rotation.
 * This function creates a new daily rotating file transport for a given log level.
 * 
 * @param {string} level - The level of logs to record.
 * @returns {winston.transports.DailyRotateFile} The created transport.
 */
function createLoggerTransport(level) {
	// Create a new daily rotate file transport for Winston
	let transport = new winston.transports.DailyRotateFile({
		//This sets the filename pattern, date pattern, maximum number of log files to keep, and log level for the transport.
		filename: `logs/application-${level}-%DATE%.log`, // The filename pattern to use
		datePattern: "YYYY-MM-DD-HH", // The date pattern to use in the filename
		maxFiles: "30d", // The maximum number of log files to keep
		level: level // The level of logs to record
	});

	// When the log file is rotated, it resets the error count, saves it to a file, and deletes the old log file.
	transport.on("rotate", function (oldFilename, newFilename) {
		// Reset the error log count
		logNumbers.error = 0;
		// Convert the log numbers to a string
		logNumbersString = JSON.stringify(logNumbers);
		// Write the log numbers to a file
		fs.writeFileSync("logNumbers.json", logNumbersString);
		// Delete the old log file
		fs.unlink(oldFilename, (err) => {
			//If there's an error deleting the old log file, it logs the error. Otherwise, it logs that the file was deleted.
			if (err) {
				// If an error occurred, log it
				logger.log('error', err.stack);
			} else {
				// Otherwise, log that the file was deleted
				console.log("Log file deleted");
			};
		});
	});

	return transport;
};

// Create a new logger instance using the winston library
function createLogger() {
    return winston.createLogger({
        // This block defines the logging levels. The lower the number, the higher the serverity. For example, critical is more severe than error.
        levels: {
            critical: 0,
            error: 1,
            warning: 2,
            info: 3,
            verbose: 4
        },

        // This sets the format of the log messages. It combines a timestamp and a custom print function.
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
                /*If the log level is error, it increments the error count, saves it to a file, and formats the log message to include the error count. 
                For other log levels, it simply formats the log message with the timestamp, level, and message.*/
                if (level == "error") {
                    logNumbers.error++;
                    logNumbersString = JSON.stringify(logNumbers);
                    fs.writeFileSync("logNumbers.json", logNumbersString);
                    return `[${timestamp}] ${level} - Error Number ${logNumbers.error}: ${message}`;
                } else {
                    return `[${timestamp}] ${level}: ${message}`
                }
            })
        ),

        /* This sets up the transports, which are the storage mechanisms for the logs. It creates a daily rotating file for each log level and also logs errors
        to the console. */
        transports: [
            createLoggerTransport("critical"),
            createLoggerTransport("error"),
            createLoggerTransport("info"),
            createLoggerTransport("verbose"),
            new winston.transports.Console({ handlelevel: 'error', handleExceptions: true })
        ],
    })
}

module.exports = {
    logger: createLogger() // Create a new logger instance using the winston library
}