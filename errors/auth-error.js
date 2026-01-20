const AppError = require('./app-error');
class AuthError extends AppError {
    constructor(message, statusCode = 401, options = {}) {
        super(message, statusCode, options);
    }
}

module.exports = AuthError;