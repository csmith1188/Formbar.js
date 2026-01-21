const AppError = require("@errors/app-error");
const { logger } = require("@modules/logger");

module.exports = (err, req, res, next) => {
    let error = err;
    let statusCode = err.statusCode || 500;

    const isAppError = err instanceof AppError;
    const isOperationalError = isAppError && err.isOperational;

    if (!isAppError || !isOperationalError) {
        statusCode = 500;
        error = new AppError("An unexpected error occurred.", statusCode);
        logger.log("error", error.stack);
    }

    const response = {
        error: {
            message: error.message,
        },
    };

    res.status(statusCode).json(response);
};
