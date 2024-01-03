const winston = require('winston')
require('winston-daily-rotate-file')

function createLoggerTransport(level) {
	let transport = new winston.transports.DailyRotateFile({
		filename: `logs/%DATE%${level}.log`,
		datePattern: 'YYYY-MM-DD-HH',
		maxFiles: '30d'
	})

	transport.on('rotate', function (oldFilename, newFilename) {
		// do something fun
	})
}

const logger = winston.createLogger({
	levels: {
		critical: 0,
		error: 1,
		warning: 2,
		info: 3,
		verbose: 4
	},
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.printf(({ timestamp, level, message }) => {
			if (level == "error") {
				logNumbers.error++;
				var logNumbersString = JSON.stringify(logNumbers);
				fs.writeFileSync("logNumbers.json", logNumbersString);
				return `[${timestamp}] ${level} - Error Number ${logNumbers.error}: ${message}`;
			} else {
				return `[${timestamp}] ${level}: ${message}`
			}
		})
	),
	transports: [
		createLoggerTransport('critical'),
		new winston.transports.File('error'),
		new winston.transports.File('info'),
		new winston.transports.File('verbose'),
		new winston.transports.Console({ level: 'error' })
	],
})