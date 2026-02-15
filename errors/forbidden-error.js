const AppError = require("./app-error");

class ForbiddenError extends AppError {
    constructor(message, options = {}) {
        super(message, { statusCode: 403, ...options });
    }
}

module.exports = ForbiddenError;
