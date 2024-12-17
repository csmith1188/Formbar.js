const { logger } = require("../../modules/logger")

module.exports = {
    order: 10,
    run(socket, socketUpdates) {
        // Authentication for users and plugins to connect to formbar websockets
        // The user must be logged in order to connect to websockets
        socket.use(([event, ...args], next) => {
            try {
                let { api } = socket.request.headers

                logger.log('info', `[socket authentication] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)}) api=(${api}) event=(${event})`)

                if (socket.request.session.username) {
                    next()
                } else if (api) {
                    database.get(
                        'SELECT id, username FROM users WHERE API = ?',
                        [api],
                        (err, userData) => {
                            try {
                                if (err) throw err
                                if (!userData) {
                                    logger.log('verbose', '[socket authentication] not a valid API Key')
                                    next(new Error('Not a valid API key'))
                                    return
                                }

                                socket.request.session.api = api
                                socket.request.session.userId = userData.id
                                socket.request.session.username = userData.username
                                socket.request.session.class = 'noClass'

                                next()
                            } catch (err) {
                                logger.log('error', err.stack)
                            }
                        }
                    )
                } else if (event == 'reload') {
                    next()
                } else {
                    logger.log('info', '[socket authentication] Missing username or api')
                    next(new Error('Missing API key'))
                }
            } catch (err) {
                logger.log('error', err.stack)
            }
        })
    }
}