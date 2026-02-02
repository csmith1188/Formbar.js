const AppError = require("./app-error");
class AuthError extends AppError {
    constructor(message, statusCode = 401, event, options = {}) {
        super(message, statusCode, event, options);
    }
}

module.exports = AuthError;
