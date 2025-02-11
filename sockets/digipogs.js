const { io } = require('../modules/webServer');
const { logger } = require('../modules/logger');

module.exports = {
    run(socket) {
        socket.on('requestDigipogs', (data) => {
            try {
                logger.log('info', `[requestDigipogs] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`);
                logger.log('info', `[requestDigipogs] data=(${JSON.stringify(data)})`);

                if (data.consent === 'accept') {
                    io.to(`user-${socket.request.session.username}`).emit('transferDigipogs', data.digipogs);
                } else {

                };
            } catch (err) {
                logger.log('error', err.stack);
            };
        });
    }
};
