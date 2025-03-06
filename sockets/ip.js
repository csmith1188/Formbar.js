const { whitelistedIps, blacklistedIps } = require("../modules/authentication")
const { settings } = require("../modules/config")
const { database } = require("../modules/database")
const { logger } = require("../modules/logger")
const fs = require('fs')

module.exports = {
    run(socket, socketUpdates) {
        socket.on('ipUpdate', () => {
            socketUpdates.ipUpdate(null, socket.request.session.username)
        })

        socket.on('changeIp', (type, id, ip) => {
            try {
                logger.log('info', `[changeIp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[changeIp] type=(${type}) id=(${id}) ip=(${ip})`)

                if (type != 'whitelist' && type != 'blacklist') {
                    logger.log('critical', 'invalid type')
                    socket.emit('message', 'Invalid Ip type')
                    return
                }

                database.get(`SELECT * FROM ip_${type} WHERE id=?`, id, (err, dbIp) => {
                    if (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }

                    if (!dbIp) {
                        socket.emit('message', 'Ip not found')
                        return
                    }

                    database.run(`UPDATE ip_${type} set ip=? WHERE id=?`, [ip, id], (err) => {
                        if (err) {
                            logger.log('error', err)
                        } else {
                            if (type == 'whitelist') {
                                whitelistedIps[dbIp.id].ip = ip
                            } else if (type == 'blacklist') {
                                blacklistedIps[dbIp.id].ip = ip
                            }

                            socketUpdates.reloadPageByIp(type == 'whitelist', ip)
                            socketUpdates.reloadPageByIp(type == 'whitelist', dbIp.ip)
                            socketUpdates.ipUpdate(type)
                        }
                    })
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('addIp', (type, ip) => {
            logger.log('info', `[addIp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[addIp] type=(${type}) ip=(${ip})`)

            if (type != 'whitelist' && type != 'blacklist') {
                logger.log('critical', 'invalid type')
                socket.emit('message', 'Invalid Ip type')
                return
            }

            database.get(`SELECT * FROM ip_${type} WHERE ip=?`, ip, (err, dbIp) => {
                if (err) {
                    logger.log('error', err.stack)
                    socket.emit('message', 'There was a server error try again.')
                    return
                }

                if (dbIp) {
                    socket.emit('message', `IP already in ${type}`)
                    return
                }

                database.run(`INSERT INTO ip_${type} (ip) VALUES(?)`, [ip], (err) => {
                    if (err) {
                        logger.log('error', err.stack)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }

                    database.get(`SELECT * FROM ip_${type} WHERE ip=?`, ip, (err, dbIp) => {
                        if (err) {
                            logger.log('error', err.stack)
                            socket.emit('message', 'There was a server error try again.')
                            return
                        }

                        if (type == 'whitelist') {
                            whitelistedIps[dbIp.id] = dbIp
                        } else if (type == 'blacklist') {
                            blacklistedIps[dbIp.id] = dbIp
                        }

                        socketUpdates.reloadPageByIp(type != 'whitelist', ip)
                        socketUpdates.ipUpdate(type)
                        socket.emit('message', `IP added to ${type}`)
                    })
                })
            })
        })

        socket.on('removeIp', (type, id) => {
            try {
                logger.log('info', `[removeIp] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[removeIp] type=(${type}) id=(${id})`)

                if (type != 'whitelist' && type != 'blacklist') {
                    logger.log('critical', 'invalid type')
                    socket.emit('message', 'Invalid Ip type')
                    return
                }

                database.get(`SELECT * FROM ip_${type} WHERE id=?`, id, (err, dbIp) => {
                    if (err) {
                        logger.log('error', err)
                        socket.emit('message', 'There was a server error try again.')
                        return
                    }

                    if (!dbIp) {
                        socket.emit('message', 'Ip not found')
                        return
                    }

                    database.run(`DELETE FROM ip_${type} WHERE id=?`, [id], (err) => {
                        if (err) {
                            logger.log('error', err)
                            socket.emit('message', 'There was a server error try again.')
                            return
                        }

                        socketUpdates.reloadPageByIp(type != 'whitelist', dbIp.ip)
                        if (type == 'whitelist') {
                            delete whitelistedIps[id]
                        } else if (type == 'blacklist') {
                            delete blacklistedIps[id]
                        }
                        socketUpdates.ipUpdate(type)
                    })
                })
            } catch (err) {
                logger.log('error', err.stack)
            }
        })

        socket.on('toggleIpList', (type) => {
            logger.log('info', `[toggleIpList] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
            logger.log('info', `[toggleIpList] type=(${type})`)

            if (type != 'whitelist' && type != 'blacklist') {
                logger.log('critical', 'invalid type')
                socket.emit('message', 'Invalid Ip type')
                return
            };

            // Sets the typeActive to the opposite of what it currently is and flips it in the .env file
            settings[`${type}Active`] = !settings[`${type}Active`]
            fs.readFile('./.env', 'utf8', (err, data) => {
                if (err) {
                    logger.log('error', err.stack)
                    socket.emit('message', 'There was a server error try again.')
                    return
                };

                const newEnv = data.replace(`${type.toUpperCase()}_ENABLED='${!settings[`${type}Active`]}'`, `${type.toUpperCase()}_ENABLED='${settings[`${type}Active`]}'`)
                fs.writeFileSync('./.env', newEnv);
            });

            // Old code in case the .env code doesn't work or causes issues
            // settings[`${type}Active`] = !settings[`${type}Active`]
            // fs.writeFileSync('./settings.json', JSON.stringify(settings))

            let ipList
            if (type == 'whitelist') ipList = whitelistedIps;
            else if (type == 'blacklist') ipList = blacklistedIps;

            for (let ip of Object.values(ipList)) {
                socketUpdates.reloadPageByIp(type != 'whitelist', ip.ip)
            }
            socketUpdates.ipUpdate(type)
        })
    }
}