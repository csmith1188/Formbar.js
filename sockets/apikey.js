const { dbRun } = require('../modules/database')
const { logger } = require('../modules/logger')
const { logNumbers } = require('../modules/config')
const crypto = require('crypto')

module.exports = {
    run(socket) {
        socket.on('refreshApiKey', () => {
            // Log the request information
            logger.log('info', `[refreshApiKey] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
            const id = socket.request.session.userId;
            // Check if userId is null or undefined
            if (!id) {
                logger.log('error', 'User ID not found in session');
                return socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
            }
            let newAPI = crypto.randomBytes(32).toString('hex');
            socket.request.session.API = newAPI;
            // Generate a new API key and update the database
            dbRun('UPDATE users SET API = ? WHERE id = ?', [newAPI, id])
                .then(() => {
                    // Log the successful API key update and emit the key update event
                    logger.log('info', `[apiKeyUpdated] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                    socket.emit('apiKeyUpdated', newAPI);
                })
                .catch((err) => {
                    // Log the error and emit an error event
                    logger.log('error', err.stack);
                    socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
                })
            
        })
    }
}