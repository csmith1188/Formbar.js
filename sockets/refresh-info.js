const { dbRun } = require("@modules/database");
const { hash } = require("@modules/crypto");
const crypto = require("crypto");

module.exports = {
    run(socket) {
        socket.on("refreshApiKey", async () => {
            try {
                // Log the request information
                const id = socket.request.session.userId;

                // Check if userId is null or undefined
                if (!id) {
                    return socket.emit("error", "There was a server error try again.");
                }

                // Generate a new API key and hash it before storing it in the database
                let newAPI = crypto.randomBytes(32).toString("hex");
                const hashedAPI = await hash(newAPI);
                await dbRun("UPDATE users SET API = ? WHERE id = ?", [hashedAPI, id]);
                socket.request.session.API = hashedAPI;

                // Log the successful API key update and emit the plaintext key (one-time view)
                socket.emit("apiKeyUpdated", newAPI);
            } catch (err) {
                socket.emit("error", "There was a server error try again.");
            }
        });

        socket.on("refreshPin", async (data) => {
            try {
                // Log the request information
                const { newPin } = data;

                // Check if userId is null or undefined
                const userId = socket.request.session.userId;
                if (!userId) {
                    return socket.emit("error", "There was a server error try again.");
                } else if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
                    // Validate the new PIN. Must be 4-6 digits, numeric only
                    return socket.emit("error", "Invalid PIN format. PIN must be 4-6 digits.");
                }

                // Hash the new PIN then store it in the database
                const hashedPin = await hash(String(newPin));
                await dbRun("UPDATE users SET pin = ? WHERE id = ?", [hashedPin, userId]);

                // Log the successful PIN update and emit success
                socket.emit("pinUpdated", { success: true });
            } catch (err) {
                socket.emit("error", "There was a server error try again.");
            }
        });
    },
};
