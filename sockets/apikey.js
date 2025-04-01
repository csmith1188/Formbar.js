const { database } = require('../modules/database')
const { logger } = require('../modules/logger')
const crypto = require('crypto')

module.exports = {
    run(socket, socketUpdates) {
        socket.on('apiRefresh', () => {
            const id = socket.request.session.id;
            database.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
                if (err) {
                    logger.log('error', err.stack)
                    return;
                };
                row.API = crypto.randomBytes(32).toString('hex');
            });
            socketUpdates.reloadPageBIp();
        })
    }
}