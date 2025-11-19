const { dbRun } = require("../modules/database");
const { logger } = require("../modules/logger");
const { logNumbers } = require("../modules/config");
const { hash } = require("../modules/crypto");
const crypto = require("crypto");

module.exports = {
    run(socket) {
        socket.on("refreshApiKey", async () => {
            try {
                // Log the request information
                logger.log("info", `[refreshApiKey] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                const id = socket.request.session.userId;

                // Check if userId is null or undefined
                if (!id) {
                    logger.log("error", "User ID not found in session");
                    return socket.emit("error", `Error Number ${logNumbers.error}: There was a server error try again.`);
                }

                // Generate a new API key and hash it before storing it in the database
                let newAPI = crypto.randomBytes(32).toString("hex");
                const hashedAPI = await hash(newAPI);
                await dbRun("UPDATE users SET API = ? WHERE id = ?", [hashedAPI, id]);

                // Log the successful API key update and emit the plaintext key (one-time view)
                logger.log("info", `[apiKeyUpdated] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                socket.emit("apiKeyUpdated", newAPI);
            } catch (err) {
                logger.log("error", err.stack);
                socket.emit("error", `Error Number ${logNumbers.error}: There was a server error try again.`);
            }
        });

        socket.on("refreshPin", async (data) => {
            try {
                // Log the request information
                logger.log("info", `[refreshPin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                const { newPin } = data;

                // Check if userId is null or undefined
                const userId = socket.request.session.userId;
                if (!userId) {
                    logger.log("error", "User ID not found in session");
                    return socket.emit("error", `Error Number ${logNumbers.error}: There was a server error try again.`);
                } else if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
                    // Validate the new PIN. Must be 4-6 digits, numeric only
                    logger.log("error", "Invalid PIN format");
                    return socket.emit("error", `Error Number ${logNumbers.error}: Invalid PIN format. PIN must be 4-6 digits.`);
                }

                // Hash the new PIN then store it in the database
                const hashedPin = await hash(String(newPin));
                await dbRun("UPDATE users SET pin = ? WHERE id = ?", [hashedPin, userId]);

                // Log the successful PIN update and emit success
                logger.log("info", `[pinUpdated] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                socket.emit("pinUpdated", { success: true });
            } catch (err) {
                logger.log("error", err.stack);
                socket.emit("error", `Error Number ${logNumbers.error}: There was a server error try again.`);
            }
        });
    },
};
