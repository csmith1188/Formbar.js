const { getLogger, logEvent } = require("@modules/logger");

/**
 * Shared error handler for socket event handlers.
 * Logs the error using the production logger and emits an error message to the client.
 *
 * @param {Error|string} err - The error object or message
 * @param {Object} socket - The socket.io socket instance
 * @param {string} event - The name of the event where the error occurred
 */
async function handleSocketError(err, socket, event, customMessage) {
    const logger = await getLogger();

    const errorMessage = err instanceof Error ? err.message : err;
    const stack = err instanceof Error ? err.stack : new Error().stack;

    // Log the error
    logEvent(logger, "error", "socket.error", errorMessage, {
        event: event,
        stack: stack,
        socketId: socket.id,
        email: socket.request.session?.email,
        userId: socket.request.session?.userId,
    });

    // Emit error back to client
    socket.emit("error", {
        message: customMessage || "An internal server error occurred.",
        event: event,
    });
}

module.exports = {
    handleSocketError,
};
