const AppError = require("@errors/app-error");
const { logger } = require("@modules/logger");

module.exports = (err, req, res, next) => {
    let error = err;
    let statusCode = err.statusCode || 500;

    const isAppError = err instanceof AppError;
    const isOperationalError = isAppError && err.isOperational;

    // Handle unexpected errors
    if (!isAppError || !isOperationalError) {
        
        req.logger.error(error);
        statusCode = 500;
        error = new AppError("An unexpected error occurred.", statusCode);

    } else {
        const event = err.event || "request.error";
        req.logger.warn(err);
    }

    const response = {
        success: false,
        error: {
            message: error.message,
        },
    };

    res.status(statusCode).json(response);
};
