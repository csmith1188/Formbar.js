const { dbRun, database } = require('../modules/database')
const { logger } = require('../modules/logger')
const { logNumbers } = require('../modules/config')
const crypto = require('crypto')

module.exports = {
    run(socket) {
        socket.on('refreshApiKey', async () => {
            try {
                // Log the request information
                logger.log('info', `[refreshApiKey] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                const id = socket.request.session.userId;

                // Check if userId is null or undefined
                if (!id) {
                    logger.log('error', 'User ID not found in session');
                    return socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
                }

                // Generate a new API key
                let newAPI = crypto.randomBytes(32).toString('hex');
                socket.request.session.API = newAPI;

                // Generate a new API key and update the database
                await dbRun('UPDATE users SET API = ? WHERE id = ?', [newAPI, id])

                // Log the successful API key update and emit the key update event
                logger.log('info', `[apiKeyUpdated] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                socket.emit('apiKeyUpdated', newAPI);
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
            }
        })

        socket.on("refreshPin", async (newPin) => {
            try {
                // Log the request information
                logger.log('info', `[refreshPin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);

                // Check if userId is null or undefined
                const userId = socket.request.session.userId;
                if (!userId) {
                    logger.log('error', 'User ID not found in session');
                    return socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
                } else if (!newPin || newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
                    // Validate the new PIN. Must be 4-6 digits, numeric only
                    logger.log('error', 'Invalid PIN format');
                    return socket.emit('error', `Error Number ${logNumbers.error}: Invalid PIN format. PIN must be 4-6 digits.`);
                }

                // Update the PIN in the database
                await dbRun('UPDATE users SET pin = ? WHERE id = ?', [newPin, userId]);

                // Log the successful PIN update and emit the PIN update event
                logger.log('info', `[pinUpdated] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                socket.emit('pinUpdated', newPin);
            } catch (err) {
                logger.log('error', err.stack);
                socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
            }
        })
    }
}