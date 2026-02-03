const AppError = require("./app-error");
class AuthError extends AppError {
    constructor(message, options = {}) {
        super(message, { statusCode: 401, ...options });
    }
}

module.exports = AuthError;
