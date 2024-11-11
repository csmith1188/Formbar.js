const { classInformation } = require("../modules/class")
const { logger } = require("../modules/logger")
const { pollUpdate, updateVirtualBar, updateClassPermissions } = require("../modules/socketUpdates")

// Functions
// General functions
function convertHSLToHex(hue, saturation, lightness) {
	try {
		logger.log('info', `[convertHSLToHex] hue=${hue}, saturation=${saturation}, lightness=${lightness}`)

		// Normalize lightness to range 0-1
		lightness /= 100;

		// Calculate chroma
		const chroma = saturation * Math.min(lightness, 1 - lightness) / 100;

		// Function to get color component
		function getColorComponent(colorIndex) {
			try {
				const colorPosition = (colorIndex + hue / 30) % 12;
				const colorValue = lightness - chroma * Math.max(Math.min(colorPosition - 3, 9 - colorPosition, 1), -1);

				// Return color component in hexadecimal format
				return Math.round(255 * colorValue).toString(16).padStart(2, '0');
			} catch (err) {
				return err
			}
		}

		// Return the hex color
		logger.log('verbose', `[convertHSLToHex]  color=(${getColorComponent(0)}${getColorComponent(8)}${getColorComponent(4)})`)

		let red = getColorComponent(0)
		let green = getColorComponent(8)
		let blue = getColorComponent(4)

		if (red instanceof Error) throw red
		if (green instanceof Error) throw green
		if (blue instanceof Error) throw blue

		return `#${red}${green}${blue}`;
	} catch (err) {
		return err
	}
}

function generateColors(amount) {
	try {
		logger.log('info', `[generateColors] amount=(${amount})`)
		// Initialize colors array
		let colors = []

		// Initialize hue
		let hue = 0

		// Generate colors
		for (let i = 0; i < amount; i++) {
			// Add color to the colors array
			let color = convertHSLToHex(hue, 100, 50)

			if (color instanceof Error) throw color

			colors.push(color);

			// Increment hue
			hue += 360 / amount
		}

		// Return the colors array
		logger.log('verbose', `[generateColors] colors=(${colors})`)
		return colors
	} catch (err) {
		return err
	}
}

module.exports = {
    run(socket) {
        // Starts a new poll. Takes the number of responses and whether or not their are text responses
        socket.on('startPoll', async (resNumber, resTextBox, pollPrompt, polls, blind, weight, tags, boxes, indeterminate, lastResponse, multiRes) => {
            try {
                logger.log('info', `[startPoll] ip=(${socket.handshake.address}) session=(${JSON.stringify(socket.request.session)})`)
                logger.log('info', `[startPoll] resNumber=(${resNumber}) resTextBox=(${resTextBox}) pollPrompt=(${pollPrompt}) polls=(${JSON.stringify(polls)}) blind=(${blind}) weight=(${weight}) tags=(${tags})`)

                await clearPoll()
                let generatedColors = generateColors(resNumber)
                logger.log('verbose', `[pollResp] user=(${classInformation[socket.request.session.class].students[socket.request.session.username]})`)
                if (generatedColors instanceof Error) throw generatedColors

                classInformation[socket.request.session.class].mode = 'poll'
                classInformation[socket.request.session.class].poll.blind = blind
                classInformation[socket.request.session.class].poll.status = true
                
                if (tags) {
                    classInformation[socket.request.session.class].poll.requiredTags = tags
                } else {
                    classInformation[socket.request.session.class].poll.requiredTags = []
                }

                if (boxes) {
                    classInformation[socket.request.session.class].poll.studentBoxes = boxes
                } else {
                    classInformation[socket.request.session.class].poll.studentBoxes = []
                }

                if (indeterminate) {
                    classInformation[socket.request.session.class].poll.studentIndeterminate = indeterminate
                } else {
                    classInformation[socket.request.session.class].poll.studentIndeterminate = []
                }

                if (lastResponse) {
                    classInformation[socket.request.session.class].poll.lastResponse = lastResponse
                } else {
                    classInformation[socket.request.session.class].poll.lastResponse = []
                }

                // Creates an object for every answer possible the teacher is allowing
                for (let i = 0; i < resNumber; i++) {
                    let letterString = 'abcdefghijklmnopqrstuvwxyz'
                    let answer = letterString[i]
                    let weight = 1
                    let color = generatedColors[i]

                    if (polls[i].answer)
                        answer = polls[i].answer
                    if (polls[i].weight)
                        weight = polls[i].weight
                    if (polls[i].color)
                        color = polls[i].color

                    classInformation[socket.request.session.class].poll.responses[answer] = {
                        answer: answer,
                        weight: weight,
                        color: color
                    }
                }

                classInformation[socket.request.session.class].poll.weight = weight
                classInformation[socket.request.session.class].poll.textRes = resTextBox
                classInformation[socket.request.session.class].poll.prompt = pollPrompt
                classInformation[socket.request.session.class].poll.multiRes = multiRes

                for (var key in classInformation[socket.request.session.class].students) {
                    classInformation[socket.request.session.class].students[key].pollRes.buttonRes = ''
                    classInformation[socket.request.session.class].students[key].pollRes.textRes = ''
                }

                logger.log('verbose', `[startPoll] classData=(${JSON.stringify(classInformation[socket.request.session.class])})`)

                pollUpdate()
                updateVirtualBar()
                updateClassPermissions()
                socket.emit('startPoll')
            } catch (err) {
                logger.log('error', err.stack);
            }
        })
    }
}