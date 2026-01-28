const AppError = require("@errors/app-error");
const { logger } = require("@modules/logger");

module.exports = (err, req, res, next) => {
    let error = err;
    let statusCode = err.statusCode || 500;

    const isAppError = err instanceof AppError;
    const isOperationalError = isAppError && err.isOperational;

    // Handle unexpected errors
    if (!isAppError || !isOperationalError) {
        
        statusCode = 500;
        error = new AppError("An unexpected error occurred.", statusCode);
        req.logger.error("request.crash", {
            message: err.message,
            stack: err.stack,
        });

    } else {
        req.logger.warn("request.error", {
            message: err.message,
        });
    }

    const response = {
        success: false,
        error: {
            message: error.message,
        },
    };

    res.status(statusCode).json(response);
};
