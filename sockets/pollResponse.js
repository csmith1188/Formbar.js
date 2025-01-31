const { classInformation } = require("../modules/class")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const { advancedEmitToClass } = require("../modules/socketUpdates")

module.exports = {
    run(socket, socketUpdates) {
        // /poll websockets for updating the database
        socket.on('pollResp', (res, textRes) => {
            try {
                // This is hardcoded for now as digipogs aren't implemented yet.
                // These should be calculated on the server rather than the client to prevent exploits to obtain digipogs.
                const resWeight = 1;
                const resLength = 0;

                logger.log('info', `[pollResp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[pollResp] res=(${res}) textRes=(${textRes}) resWeight=(${resWeight}) resLength=(${resLength})`)
                
                const classId = socket.request.session.classId
                const username = socket.request.session.username
                const classroom = classInformation.classrooms[classId]
                if (classroom.students[username].pollRes.buttonRes != res || classroom.students[username].pollRes.textRes != textRes) {
                    if (res == 'remove') {
                        advancedEmitToClass('removePollSound', classId, { api: true })
                    } else {
                        advancedEmitToClass('pollSound', classId, { api: true })
                    }
                }

                classroom.students[username].pollRes.buttonRes = res
                classroom.students[username].pollRes.textRes = textRes
                classroom.students[username].pollRes.time = new Date()

                for (let i = 0; i < resLength; i++) {
                    if (res) {
                        let calcWeight = classroom.poll.weight * resWeight
                        classroom.students[socket.request.session.username].pogMeter += calcWeight
                        if (classroom.students[socket.request.session.username].pogMeter >= 25) {
                            database.get('SELECT digipogs FROM classusers WHERE studentId=?', [classroom.students[socket.request.session.username].id], (err, data) => {
                                try {
                                    if (err) throw err

                                    database.run('UPDATE classusers SET digiPogs=? WHERE studentId=?', [data + 1, classroom.students[socket.request.session.username].id], (err) => {
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
                            classroom.students[socket.request.session.username].pogMeter = 0
                        }
                    }
                }
                logger.log('verbose', `[pollResp] user=(${classroom.students[socket.request.session.username]})`)

                socketUpdates.classPermissionUpdate()
                socketUpdates.virtualBarUpdate()
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}