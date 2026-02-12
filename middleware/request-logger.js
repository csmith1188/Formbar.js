const ip = require("@controllers/ip");
const {getLogger, logEvent} = require("@modules/logger");
const crypto = require("crypto");

// Middleware to log incoming requests and their completion time

async function requestLogger(req, res, next) {

    // Attach a child logger to the request with relevant metadata
    const baseMeta = {
        requestId: crypto.randomUUID(),
        method: req.method,
        path: req.originalUrl,
        ip: req.ip
    }

    // Add user info if available
    if (req.user && req.user.id) {
        baseMeta.userId = req.user.id;
        baseMeta.email = req.user.email;
        baseMeta.displayName = req.user.displayName;
    }

    // adds metadata to every log under this request
    const logger = await getLogger();
    req.logger = logger.child(baseMeta);

    // helpers to log events with the request's logger
    req.logEvent = logEvent.bind(null, req.logger);
    req.infoEvent = req.logEvent.bind(null, "info");
    req.warnEvent = req.logEvent.bind(null, "warn");
    req.errorEvent = req.logEvent.bind(null, "error");

    const start = process.hrtime.bigint();

    // set listener for when response finishes
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        req.infoEvent("request.complete", "Request Complete", {
            statusCode: res.statusCode,
            duration: durationMs
        });
    });

    next();
}

module.exports = requestLogger;