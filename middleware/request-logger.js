const ip = require("@controllers/ip");
const {logger, logEvent} = require("@modules/logger");

// Middleware to log incoming requests and their completion time

function requestLogger(req, res, next) {

    // Attach a child logger to the request with relevant metadata
    const baseMeta = {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip
    }

    // Add user info if available
    if (req.session?.user) {
        baseMeta.userId = req.session.user.id;
        baseMeta.username = req.session.user.username;
    }

    // adds metadata to every log under this request
    req.logger = logger.child(baseMeta);

    // helpers to log events with the request's logger
    req.logEvent = logEvent.bind(null, req.logger);
    req.info = req.logEvent.bind(null, "info");
    req.warn = req.logEvent.bind(null, "warn");
    req.error = req.logEvent.bind(null, "error");

    const start = process.hrtime.bigint();

    // set listener for when response finishes
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        req.logEvent("info", "request.complete", "", {
            statusCode: res.statusCode,
            duration: durationMs
        });
    });

    next();
}

module.exports = requestLogger;