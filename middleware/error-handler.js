const AppError = require("@errors/app-error");
const { logger, logEvent } = require("@modules/logger");
const process = require("process");

module.exports = (err, req, res, next) => {

    console.error(err);

    let error = err;
    let statusCode = err.statusCode || 500;

    const isAppError = err instanceof AppError;
    const isOperationalError = isAppError && err.isOperational;

    // is error a crash
    if (!isAppError || !isOperationalError) {

        req.errorEvent("request.crash", error.message, error);
        if (process.env.NODE_ENV !== "production") {
            console.error(error);
            console.log("Flushing logs before exit...");
            logger.close();
        }

        statusCode = 500;
        error = new AppError("An unexpected error occurred.", statusCode);

        // is error expected operational error
    } else {
        const event = err.event || "request.error";
        req.warnEvent(event, err.message, err);
    }

    const response = {
        success: false,
        error: {
            message: error.message,
        },
    };

    res.status(statusCode).json(response);
};
