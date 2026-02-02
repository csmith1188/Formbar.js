const AppError = require("./app-error");

class ForbiddenError extends AppError {
    constructor(message, statusCode = 403, event, options = {}) {
        super(message, statusCode, event, options);
    }
}

module.exports = ForbiddenError;
