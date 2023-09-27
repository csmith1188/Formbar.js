const ws281x = require('rpi-ws281x-native')

let strip = ws281x(52, {
	dma: 10,
	freq: 800000,
	gpio: 18,
	invert: false,
	brightness: 255,
	stripType: ws281x.stripType.SK6812_GRBW
})
const pixels = strip.array
strip.brightness = 100

// fill strip with color
function fill(color, start = 0, length = pixels.length) {
	if (length >= pixels.length) length = pixels.length

	for (let i = 0; i < length; i++) {
		pixels[i + start] = color
	}
}

// clear strip
fill(0x000000)

// testing
let pollData = {
	"totalStudents": 10,
	"pollPrompt": "",
	"polls": {
		"a": {
			"display": "answer a",
			"responses": 1,
			"color": "#FF0000"
		},
		"b": {
			"display": "answer b",
			"responses": 1,
			"color": "#00FF00"
		},
		"c": {
			"display": "answer c",
			"responses": 3,
			"color": "#1111EE"
		},
		"d": {
			"display": "answer d",
			"responses": 5,
			"color": "#EEEE11"
		}
	}
}

// convert colors to integers
for (let poll of Object.keys(pollData.polls)) {
	pollData.polls[poll].color = parseInt(pollData.polls[poll].color.slice(1), 16)
}

// count non-empty polls
let nonEmptyPolls = -1
for (let poll of Object.values(pollData.polls)) {
	if (poll.responses > 0) {
		console.log('add')
		nonEmptyPolls++
	}
}

let pixelsPerStudent = Math.floor((pixels.length - nonEmptyPolls) / pollData.totalStudents)

fill(0xFFFFFF)

// add polls
let currentPixel = 0
for (let [name, poll] of Object.entries(pollData.polls)) {
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