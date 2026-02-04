class AppError extends Error {
    constructor(message, options = {
        statusCode: 500,
        event: "",
        reason: ""
    }) {
        super(message);

        this.statusCode = options.statusCode;
        this.isOperational = true;

        Object.assign(this, options);

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
