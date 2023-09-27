const ws281x = require('rpi-ws281x-native')
const { io } = require('socket.io-client')

let strip = ws281x(12, {
	dma: 10,
	freq: 800000,
	gpio: 21,
	invert: false,
	brightness: 25,
	stripType: ws281x.stripType.WS2811_RGB
})
let pixels = strip.array

const ip = '172.16.3.103:420'
const classCode = 'd5f5'

const socket = io(ip)

// fill strip with color
function fill(color, start = 0, length = pixels.length) {
	if (length >= pixels.length) length = pixels.length

	for (let i = 0; i < length; i++) {
		pixels[i + start] = color
	}
}

// clear strip
fill(0x808080)
ws281x.render()

socket.emit('joinRoom', classCode)
socket.on('pollChange', (pollsData) => {
	console.log(pollsData)
	// convert colors to integers
	for (let pollData of Object.values(pollsData.polls)) {
		pollData.color = parseInt(pollData.color.slice(1), 16)
	}

	// count non-empty polls
	let nonEmptyPolls = -1
	for (let poll of Object.values(pollsData.polls)) {
		if (poll.responses > 0) {
			nonEmptyPolls++
		}
	}

	let pixelsPerStudent = Math.floor((pixels.length - nonEmptyPolls) / pollsData.totalStudents)

	fill(0x808080)

	// add polls
	let currentPixel = 0
	for (let [name, poll] of Object.entries(pollsData.polls)) {
		let length = pixelsPerStudent * poll.responses

		if (length > 0)
			fill(
				poll.color,
				currentPixel,
				length
			)

		if (poll.responses > 0) currentPixel++
		currentPixel += length
	}

	ws281x.render()
})