class AppError extends Error {
    constructor(message, statusCode, options = {}) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
        this.isOperational = true;

        Object.assign(this, options);

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
