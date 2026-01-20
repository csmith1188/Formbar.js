const AppError = require('@errors/app-error');

module.exports = (err, req, res, next) => {

    let error = err;
    let statusCode = err.statusCode || 500;

    const isAppError = err instanceof AppError;
    const isOperationalError = isAppError && err.isOperational;

    if (!isAppError || !isOperationalError) {
        statusCode = 500;
        error = new AppError('An unexpected error occurred.', statusCode);
    }

    const response = {
        error: {
            status: error.status,
            message: error.message
        }
    }

    res.status(statusCode).json(response);

}