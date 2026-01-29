const ValidationError = require("@errors/validation-error");
const AppError = require("@errors/app-error");

function requireQueryParam(param, name) {
    if (!param) {
        throw new ValidationError(`Required parameter '${name}' is missing.`);
    }
}

function requireInternalParam(param, name) {
    if (!param) {
        throw new AppError(`Internal Error: Missing required parameter '${name}'.`, 500);
    }
}

module.exports = {
    requireQueryParam,
    requireInternalParam,
}