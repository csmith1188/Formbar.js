const { dbRun } = require('../modules/database')
const { logger } = require('../modules/logger')
const { logNumbers } = require('../modules/config')
const crypto = require('crypto')

module.exports = {
    run(socket, socketUpdates) {
        socket.on('refreshApiKey', () => {
            // Log the request information
            logger.log('info', `[socket] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
            const id = socket.request.session.userId;
            // Check if userId is null or undefined
            if (!id) {
                logger.log('error', 'User ID not found in session');
                return socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
            }
            // Generate a new API key and update the database
            dbRun('UPDATE users SET API = ? WHERE id = ?', [crypto.randomBytes(32).toString('hex'), id])
                .then(() => {
                    // Log the successful API key update
                    logger.log('info', `[socket] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) API key updated`);
                    socket.emit('reload');
                })
                .catch((err) => {
                    logger.log('error', err.stack);
                    socket.emit('error', `Error Number ${logNumbers.error}: There was a server error try again.`);
                })
            
        })
    }
}