const { classInformation } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { advancedEmitToClass } = require("../modules/socketUpdates")

module.exports = {
    run(socket, socketUpdates) {
        // /poll websockets for updating the database
        socket.on('pollResp', (res, textRes, resWeight, resLength) => {
            try {
                logger.log('info', `[pollResp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[pollResp] res=(${res}) textRes=(${textRes}) resWeight=(${resWeight}) resLength=(${resLength})`)

                if (
                    classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.buttonRes != res ||
                    classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.textRes != textRes
                ) {
                    if (res == 'remove')
                        advancedEmitToClass('removePollSound', socket.request.session.class, { api: true })
                    else
                        advancedEmitToClass('pollSound', socket.request.session.class, { api: true })
                }

                classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.buttonRes = res
                classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.textRes = textRes
                classInformation[socket.request.session.class].students[socket.request.session.username].pollRes.time = new Date()

                for (let i = 0; i < resLength; i++) {
                    if (res) {
                        let calcWeight = classInformation[socket.request.session.class].poll.weight * resWeight
                        classInformation[socket.request.session.class].students[socket.request.session.username].pogMeter += calcWeight
                        if (classInformation[socket.request.session.class].students[socket.request.session.username].pogMeter >= 25) {
                            database.get('SELECT digipogs FROM classusers WHERE studentId=?', [classInformation[socket.request.session.class].students[socket.request.session.username].id], (err, data) => {
                                try {
                                    if (err) throw err

                                    database.run('UPDATE classusers SET digiPogs=? WHERE studentId=?', [data + 1, classInformation[socket.request.session.class].students[socket.request.session.username].id], (err) => {
                                        try {
                                            if (err) throw err

                                            logger.log('verbose', `[pollResp] Added 1 digipog to ${socket.request.session.username}`)
                                        } catch (err) {
                                            logger.log('error', err.stack);
                                        }
                                    })
                                } catch (err) {
                                    logger.log('error', err.stack);
                                }
                            })
                            classInformation[socket.request.session.class].students[socket.request.session.username].pogMeter = 0
                        }
                    }
                }
                logger.log('verbose', `[pollResp] user=(${classInformation[socket.request.session.class].students[socket.request.session.username]})`)

                socketUpdates.classPermissionUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}