const { logger } = require("../../modules/logger")
const { rateLimits } = require("../../modules/socketUpdates")

module.exports = {
    order: 30,
    run(socket, socketUpdates) {
        // Rate limiter
        socket.use(([event, ...args], next) => {
            try {
                const username = socket.request.session.username
                const currentTime = Date.now()
                const timeFrame = 5000
                const blockTime = 5000
                const limitedRequests = ['pollResp', 'help', 'break']
                let limit = 5

                logger.log('info', `[rate limiter] username=(${username}) currentTime=(${currentTime})`)
                if (!rateLimits[username]) {
                    rateLimits[username] = {}
                }

                const userRequests = rateLimits[username]
                if (!limitedRequests.includes(event)) {
                    next()
                    return
                }

                userRequests[event] = userRequests[event] || []
                userRequests[event] = userRequests[event].filter((timestamp) => currentTime - timestamp < timeFrame)
                logger.log('verbose', `[rate limiter] userRequests=(${JSON.stringify(userRequests)})`)
                if (event == 'pollResp' && args[0].length > 1 && !args[0].includes('')) {
                    limit = 15
                }

                if (userRequests[event].length >= limit) {
                    socket.emit('message', `You are being rate limited. Please try again in a ${blockTime / 1000} seconds.`)
                    next(new Error('Rate limited'))
                    setTimeout(() => {
                        try {
                            userRequests[event].shift()
                        } catch (err) {
                            logger.log('error', err.stack);
                        }
                    }, blockTime)
                } else {
                    userRequests[event].push(currentTime)
                    next()
                }
            } catch (err) {
                logger.log('error', err.stack);
            }
        })        
    }
}