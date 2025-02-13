const { database } = require("../modules/database")
const { logger } = require("../modules/logger")

module.exports = {
    run(socket, socketUpdates) {
        socket.on('addPlugin', (name, url) => {
            try {
                logger.log('info', `[addPlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[addPlugin] name=(${name}) url=(${url})`)

                database.get(
                    'SELECT * FROM classroom WHERE id=?',
                    [socket.request.session.classId],
                    (err, classData) => {
                        try {
                            if (err) throw err

                            database.run(
                                'INSERT INTO plugins(name, url, classId) VALUES(?, ?, ?)',
                                [name, url, classData.id]
                            )
                            socketUpdates.pluginUpdate()
                        } catch (err) {
                            logger.log('error', err.stack)
                        }
                    }
                )
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        socket.on('removePlugin', (id) => {
            try {
                logger.log('info', `[removePlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[removePlugin] id=(${id})`)

                database.run('DELETE FROM plugins WHERE id=?', [id])
                socketUpdates.pluginUpdate()
            } catch (err) {
                logger.log('error', err.stack)
            }
        });

        socket.on('changePlugin', (id, name, url) => {
            try {
                logger.log('info', `[changePlugin] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[changePlugin] id=(${id}) name=(${name}) url=(${url})`)

                if (name) {
                    database.run(
                        'UPDATE plugins set name=? WHERE id=?',
                        [name, id],
                        (err) => {
                            if (err) {
                                logger.log('error', err)
                            } else {
                                socketUpdates.pluginUpdate()
                            }
                        }
                    )
                } else if (url) {
                    database.run('UPDATE plugins set url=? WHERE id=?', [url, id], (err) => {
                        if (err) {
                            logger.log('error', err)
                        } else {
                            socketUpdates.pluginUpdate()
                        }
                    })
                } else logger.log('critical', 'changePlugin called without name or url')
            } catch (err) {
                logger.log('error', err.stack)
            }
        });
    }
}