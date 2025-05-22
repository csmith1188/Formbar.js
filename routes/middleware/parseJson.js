/**
 * This middleware will go through the body of a request and check if something can be parsed to JSON.
 * If it can be, it will automatically be parsed.
 * @param req
 * @param res
 * @param next
 */
function parseJson(req, res, next) {
    for (const dataName in req.body) {
        try {
            req.body[dataName] = JSON.parse(req.body[dataName]);
        } catch (err) {} // Don't do anything in the case of failure
    }
    next();
}

module.exports = { parseJson };