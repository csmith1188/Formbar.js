function load(pollStatus) {
	if (pollStatus) {
		startPollForm.style.display = 'none'
		clearPoll.style.display = 'block'
		endPoll.style.display = 'block'
	} else {
		startPollForm.style.display = 'block'
		clearPoll.style.display = 'none'
		endPoll.style.display = 'none'
	}
}

function HSLToHex(hue, saturation, lightness) {
	// Normalize lightness to range 0-1
	lightness /= 100;

	// Calculate chroma
	const chroma = saturation * Math.min(lightness, 1 - lightness) / 100;

	// Function to get color component
	function getColorComponent(colorIndex) {
		const colorPosition = (colorIndex + hue / 30) % 12;
		const colorValue = lightness - chroma * Math.max(Math.min(colorPosition - 3, 9 - colorPosition, 1), -1);

		// Return color component in hexadecimal format
		return Math.round(255 * colorValue).toString(16).padStart(2, '0');
	};

	// Return the hex color
	return `#${getColorComponent(0)}${getColorComponent(8)}${getColorComponent(4)}`;
}

function hexToRGB(hexColor) {
	hexColor = hexColor.substring(1)
	let red = parseInt(hexColor.substring(0, 2), 16);
	let green = parseInt(hexColor.substring(2, 4), 16);
	let blue = parseInt(hexColor.substring(4, 6), 16);
	return { red, green, blue };
}

function rgbToHSV(red, green, blue) {
	red = red / 255, green = green / 255, blue = blue / 255;
	let maxColor = Math.max(red, green, blue)
	let minColor = Math.min(red, green, blue)
	let hue, saturation, value = maxColor
	let colorDifference = maxColor - minColor
	saturation = maxColor === 0 ? 0 : colorDifference / maxColor
	if (maxColor === minColor) {
		hue = 0
	} else {
		switch (maxColor) {
			case red: {
				hue = (green - blue) / colorDifference + (green < blue ? 6 : 0)
				break
			}
			case green: {
				hue = (blue - red) / colorDifference + 2
				break
			}
			case blue: {
				hue = (red - green) / colorDifference + 4
				break
			}
		}
		hue /= 6
	}
	return { hue: hue * 360, saturation: saturation * 100, value: value * 100 }
}

function hexToHSV(hexColor) {
	let { red, green, blue } = hexToRGB(hexColor)
	return rgbToHSV(red, green, blue)
}

function generateColors(amount) {
	// Initialize colors array
	let colors = [];

	// Initialize hue
	let hue = 0

	// Generate colors
	for (let i = 0; i < amount; i++) {
		// Add color to the colors array
		colors.push(HSLToHex(hue, 100, 50));

		// Increment hue
		hue += 360 / amount
	}

	// Return the colors array
	return colors;
}

function camelCaseToNormal(str) {
	let result = str.replace(/([A-Z])/g, ' $1')
	result = result.charAt(0).toUpperCase() + result.slice(1)
	return result
}

//displays the previous polls page
function displayPreviousPolls() {
	toPollHistoryButton.style.display = 'none'
	changeTab('previousPolls', 'polls')
}

//makes the previous polls page
function buildPreviousPolls(data) {
	previousPollButtons.innerHTML = ''
	let br = document.createElement('br')

	for (let pollIndex = data.length - 1; pollIndex >= 0; pollIndex--) {
		let pollButton = document.createElement('button')
		pollButton.type = 'button'
		pollButton.className = 'quickButton'
		pollButton.textContent = data[pollIndex].date + ' ' + data[pollIndex].data.prompt
		pollButton.onclick = (event) => {
			event.preventDefault()
			displayPoll(data[pollIndex].id)
		}
		previousPollButtons.appendChild(pollButton)

		previousPollButtons.appendChild(br.cloneNode(true))


		let previousPollDiv = document.createElement('div')
		previousPollDiv.className = 'previousPoll'
		previousPollDiv.id = data[pollIndex].id
		previousPollDiv.style.display = 'none'

		let previousPollPrompt = document.createElement('p')
		previousPollPrompt.textContent = `Prompt: ${data[pollIndex].data.prompt}`
		previousPollDiv.appendChild(previousPollPrompt)

		for (let userIndex = 0; userIndex < data[pollIndex].data.names.length; userIndex++) {
			let username = document.createElement('p')
			username.textContent = `Name: ${data[pollIndex].data.names[userIndex]}`
			previousPollDiv.appendChild(username)

			let letter = document.createElement('p')
			letter.textContent = `Letter: ${data[pollIndex].data.letter[userIndex]}`
			previousPollDiv.appendChild(letter)

			let text = document.createElement('p')
			text.textContent = `Text: ${data[pollIndex].data.text[userIndex]}`
			previousPollDiv.appendChild(text)
		}
		previousPolls.appendChild(previousPollDiv)
	}
}

function displayPoll(id) {
	if (id) {
		let previousPollDivs = document.getElementsByClassName('previousPoll')

		previousPollButtons.style.display = 'none'
		toPollsButton.style.display = 'none'
		toPollHistoryButton.style.display = ''

		for (let pollDiv of previousPollDivs) {
			if (pollDiv.id == id)
				pollDiv.style.display = 'block'
			else
				pollDiv.style.display = 'none'
		}
	} else {
		let previousPollDivs = document.getElementsByClassName('previousPoll')
		previousPollButtons.style.display = 'block'
		toPollsButton.style.display = ''
		toPollHistoryButton.style.display = 'none'

		for (let pollDiv of previousPollDivs) {
			pollDiv.style.display = 'none'
		}
	}
}

function saveColor(index) {
	let colorPickerButton = document.getElementsByClassName('colorPickerButton')[index]
	let oldColor = document.getElementsByClassName('oldColor')[index]

	pollResponses[index].color = colorPickers[index].color.hexString
	colorPickerButton.style.backgroundColor = colorPickers[index].color.hexString;
	oldColor.style.backgroundColor = colorPickers[index].color.hexString;
}

function resTextChange() {
	if (resTextBox.checked) {
		resNumber.min = 0
	}
	else {
		resNumber.min = 1
		if (resNumber.value < 1) resNumber.value = 1
	}
}

function responseAmountChange() {
	if (resTextBox.checked) {
		if (resNumber.value < 0) resNumber.value = 0
	}
	else {
		if (resNumber.value < 1) resNumber.value = 1
	}
	if (resNumber.value > 26) resNumber.value = 26

	generatedColors = generateColors(resNumber.value)
	if (pollResponses.length > resNumber.value) {

		let responseDivs = document.getElementsByClassName('response')
		for (let i = resNumber.value; i < pollResponses.length; i++) {
			document.getElementById(`response${i}`).remove()
		}

		pollResponses.splice(resNumber.value)
		colorPickers.splice(resNumber.value)
	}

	for (let i = pollResponses.length; i < resNumber.value; i++) {
		pollResponses.push({
			answer: '',
			defaultAnswer: letterString[i],
			color: '',
			defaultColor: generateColors[i],
			weight: 1,
			defaultWeight: 1
		})

		let responseDiv = document.createElement('div')
		responseDiv.className = 'response'
		responseDiv.id = `response${i}`

		let colorPickerButton = document.createElement('button')
		colorPickerButton.className = 'colorPickerButton'
		colorPickerButton.id = i
		colorPickerButton.onclick = (event) => {
			event.preventDefault()
			let id = Number(event.target.id)
			let colorPickers = document.getElementsByClassName('colorPicker')

			for (let colorPickerIndex = 0; colorPickerIndex < colorPickers.length; colorPickerIndex++) {
				if (colorPickerIndex == id) continue

				colorPickers[colorPickerIndex].style.display = 'none'
			}

			let colorPicker = colorPickers[id]
			if (colorPicker.style.display == 'grid') {
				colorPicker.style.display = 'none'
			}
			else {
				colorPicker.style.display = 'grid'
			}
		}
		responseDiv.appendChild(colorPickerButton)

		let colorPickerDiv = document.createElement('div')
		colorPickerDiv.className = 'colorPicker'

		let buttonsDiv = document.createElement('div')
		buttonsDiv.className = 'buttonsDiv'

		let saveColorButton = document.createElement('button')
		saveColorButton.className = 'quickButton'
		saveColorButton.textContent = 'Save Color'
		saveColorButton.onclick = () => {
			saveColor(i)
		}
		buttonsDiv.appendChild(saveColorButton)

		let resetColor = document.createElement('button')
		resetColor.className = 'quickButton'
		resetColor.textContent = 'Reset Color'
		resetColor.onclick = (event) => {
			event.preventDefault()
			let responseDiv = document.getElementsByClassName('response')[i]
			let colorPickerButton = responseDiv.getElementsByClassName('colorPickerButton')[0]
			let oldColor = responseDiv.getElementsByClassName('oldColor')[0]

			pollResponses[i].color = ''
			colorPickers[i].color.set(generatedColors[i])
			colorPickerButton.style.backgroundColor = generatedColors[i]
			oldColor.style.backgroundColor = generatedColors[i]
		}
		buttonsDiv.appendChild(resetColor)

		colorPickerDiv.appendChild(buttonsDiv)

		let colorsDiv = document.createElement('div')
		colorsDiv.className = 'colorsDiv'

		let oldColor = document.createElement('div')
		oldColor.className = 'oldColor'
		colorsDiv.appendChild(oldColor)

		let newColor = document.createElement('div')
		newColor.className = 'newColor'
		colorsDiv.appendChild(newColor)

		colorPickerDiv.appendChild(colorsDiv)

		let hexLabel = document.createElement('label')
		hexLabel.className = 'hexLabel'
		hexLabel.textContent = 'Hex '
		let hexInput = document.createElement('input')
		hexInput.className = 'hexInput'
		hexInput.type = 'text'
		hexInput.pattern = '[0-9A-Fa-f]{3,6}'
		hexInput.onchange = (event) => {
			event.preventDefault()
			colorPickers[i].color.set('#' + event.target.value)
		}
		hexLabel.appendChild(hexInput)

		colorPickerDiv.appendChild(hexLabel)

		responseDiv.appendChild(colorPickerDiv)

		let answerName = document.createElement('input')
		answerName.type = 'text'
		answerName.className = 'answerName'
		answerName.name = 'answerName'
		answerName.placeholder = `Answer ${String.fromCharCode(i + 97)} `
		answerName.value = ''
		answerName.onchange = (event) => {
			pollResponses[i].answer = event.target.value;
		}
		responseDiv.appendChild(answerName)

		responsesDiv.appendChild(responseDiv)

		FloatingUIDOM.autoUpdate(
			colorPickerButton,
			colorPickerDiv,
			() => {
				FloatingUIDOM.computePosition(colorPickerButton, colorPickerDiv, {
					placement: 'bottom',
					middleware: [FloatingUIDOM.offset(10), FloatingUIDOM.flip()]
				})
					.then(({ x, y }) => {
						Object.assign(colorPickerDiv.style, {
							left: `${x}px`,
							top: `${y}px`
						})
					})
			}
		)

		colorPickers[i] = new iro.ColorPicker(colorPickerDiv, {
			width: 100,
			color: generatedColors[i],
			id: i,
			layoutDirection: 'horizontal',
			layout: [
				{
					component: iro.ui.Wheel,
				},
				{
					component: iro.ui.Slider,
					options: {
						sliderType: 'value'
					}
				}
			]
		})
		colorPickers[i].on(['color:init', 'color:change'], color => {
			let newColor = responseDiv.getElementsByClassName('newColor')[0]
			let hexInput = responseDiv.getElementsByClassName('hexInput')[0]

			newColor.style.backgroundColor = color.hexString
			hexInput.value = color.hexString.substring(1)
		})
	}

	let responseDivs = document.getElementsByClassName('response')
	for (let i = 0; i < pollResponses.length; i++) {
		let responseDiv = responseDivs[i]
		let colorPickerButton = responseDiv.getElementsByClassName('colorPickerButton')[0]
		let oldColor = responseDiv.getElementsByClassName('oldColor')[0]

		pollResponses[i].defaultColor = generatedColors[i]
		if (!pollResponses[i].color) {
			colorPickerButton.style.backgroundColor = generatedColors[i]
			oldColor.style.backgroundColor = generatedColors[i]
		}
		let hsv = hexToHSV(generatedColors[i])
		colorPickers[i].color.initialValue = {
			h: hsv.hue,
			s: hsv.saturation,
			v: hsv.value,
			a: 1,
		}
	}
}
responseAmountChange()

function resetAnswerNames() {
	let answerNames = document.getElementsByName('answerName')
	for (let i = 0; i < pollResponses.length; i++) {
		pollResponses[i].answer = pollResponses[i].defaultAnswer
		answerNames[i].value = ''
	}
}
resetAnswerNamesButton.onclick = resetAnswerNames

function resetColors() {
	for (let i = 0; i < pollResponses.length; i++) {
		let responseDiv = document.getElementsByClassName('response')[i]
		let colorPickerButton = responseDiv.getElementsByClassName('colorPickerButton')[0]
		let oldColor = responseDiv.getElementsByClassName('oldColor')[0]

		pollResponses[i].color = ''
		colorPickerButton.style.backgroundColor = generatedColors[i]
		oldColor.style.backgroundColor = generatedColors[i]
	}
}
resetColorsButton.onclick = resetColors

function showResponses() {
	if (responsesDiv.style.display == 'grid')
		responsesDiv.style.display = 'none'
	else responsesDiv.style.display = 'grid'
}

function modeChange() {
	let modeP = document.getElementById('modeP')
	let modeL = document.getElementById('modeL')
	let modeQ = document.getElementById('modeQ')
	let modePT = document.getElementById('modePT')

	if (modeP.checked) {
		socket.emit('modechange', modeP.value)
	} else if (modeL.checked) {
		socket.emit('modechange', modeL.value)
	} else if (modeQ.checked) {
		socket.emit('modechange', modeQ.value)
	} else if (modePT.checked) {
		socket.emit('modechange', modePT.value)
	}
}

// Ends the poll and reloads the users page to stop any more submission
function clearPollFunc() {
	socket.emit('clearPoll')
	startPollForm.style.display = 'block'
	clearPoll.style.display = 'none'
}

function endPollFunc() {
	socket.emit('endPoll')

}
// Starts a new poll that allows students to submit answers
// Check how many possible responses and if the teacher wants to accept text responses\
function startPoll(customPollId) {
	socket.emit('cpUpdate')
	var userTags = []
	var userBoxesChecked = []
	var userIndeterminate = []
	var pollAnswers = []
	for (let i = 0; i < resNumber.value; i++) {
		let pollResponse = pollResponses[i]
		let pollAnswer = {
			answer: (pollResponse.answer) ? pollResponse.answer : pollResponse.defaultAnswer,
			weight: pollResponse.weight,
			color: (pollResponse.color) ? pollResponse.color : pollResponse.defaultColor
		}

		pollAnswers.push(pollAnswer)
	}
	var lastResponses = document.getElementById('lastResponse')
	var basedOnResponse = document.getElementById('basedOnResponse')
	var lastResponseToUse = []
	var defaultValue = basedOnResponse.value
	for (let i = basedOnResponse.length; i >= 0; i--) {
		basedOnResponse.remove(i)
	}
	for (let [key, value] of Object.entries(pollAnswers)) {
		let eachOption = document.createElement('option')
		eachOption.innerText = value.answer
		eachOption.value = value.answer
		basedOnResponse.appendChild(eachOption)
	}
	basedOnResponse.value = defaultValue
	// These are only ran to prove that the last response works (works on Luke Thompson's end). They are required because the classroomData is not being updated 24/7
	// rooms.students["notluke"].pollRes.buttonRes = "a"
	// rooms.students["isluke"].pollRes.buttonRes = "b"
	if (lastResponses.checked) {
		for (let [key, value] of Object.entries(rooms.students)) {
			if (basedOnResponse.value == value.pollRes.buttonRes) {
				lastResponseToUse.push(value.username)
			}
			//lastResponseToUse.push()
		}
	}
	else {
		let selectTagForm = document.getElementsByName('selectTagForm')
		let allCheckboxes = document.getElementsByName('studentCheckbox')
		for (let eachTagForm of selectTagForm[0]) {
			if (eachTagForm.checked) {
				userTags.push(eachTagForm.value)
			}
		}

		for (let eachBox of allCheckboxes) {
			if (eachBox.checked && !eachBox.indeterminate) {
				let boxId = eachBox.id.split('_')[1]
				userBoxesChecked.push(boxId)
			}
			if (eachBox.indeterminate) {
				let boxId = eachBox.id.split('_')[1]
				userIndeterminate.push(boxId)
			}
		}


		userTags.sort()
		userBoxesChecked.sort()
		userIndeterminate.sort()
		userBreak.sort()
	}
	if (customPollId) {
		let customPoll = customPolls[customPollId]

		changeTab('mainPolls', 'polls')

		var generatedColors = generateColors(customPoll.answers.length)
		socket.emit('startPoll', customPoll.answers.length, customPoll.textRes, customPoll.prompt, customPoll.answers, customPoll.blind, customPoll.weight, userTags, userBoxesChecked, userIndeterminate, lastResponseToUse)
	} else {
		let blind = blindCheck.checked


		var generatedColors = generateColors(resNumber.value)

		socket.emit('startPoll', resNumber.value, resTextBox.checked, pollPrompt.value, pollAnswers, blind, 1, userTags, userBoxesChecked, userIndeterminate, lastResponseToUse)
	}
	responsesDiv.style.display = 'none'
	startPollForm.style.display = 'none'
	clearPoll.style.display = 'block'
	endPoll.style.display = 'block'
	changeTab('usersMenu', 'mainTabs')
};

function editCustomPoll(customPollId) {
	editingPollId = customPollId
	let customPoll = customPolls[editingPollId]

	unloadPollButton.style.display = ''
	if (customPoll.owner == currentUser.id) {
		deletePollButton.style.display = ''
		savePollButton.style.display = ''
	} else {
		deletePollButton.style.display = 'none'
		savePollButton.style.display = 'none'
	}

	blindCheck.checked = customPoll.blind
	pollPrompt.value = customPoll.prompt
	resTextBox.checked = customPoll.textRes

	responseAmountChange(customPoll.answers.length)

	let answerInputs = document.getElementsByClassName('answerName')
	for (let pollIndex = 0; pollIndex < customPoll.answers.length; pollIndex++) {
		let answer = customPoll.answers[pollIndex]

		pollResponses[pollIndex].answer = answer.answer
		answerInputs[pollIndex].value = answer.answer

		pollResponses[pollIndex].color = answer.color
		colorPickers[pollIndex].color.set(pollResponses[pollIndex].color)
		saveColor(pollIndex)

		pollResponses[pollIndex].weight = answer.weight
	}

	changeTab('mainPolls', 'polls')
	showResponses()
}

function unloadPoll() {
	unloadPollButton.style.display = 'none'
	savePollButton.style.display = 'none'
	deletePollButton.style.display = 'none'

	pollPrompt.value = ''
	resTextBox.checked = false
	blindCheck.checked = false

	responseAmountChange(1)
	resetAnswerNames()
	resetColors()
	editingPollId = null
}

function savePoll() {
	let customPoll = customPolls[editingPollId]

	customPoll.blind = blindCheck.checked
	customPoll.prompt = pollPrompt.value
	customPoll.textRes = resTextBox.checked

	var pollAnswers = []
	for (let i = 0; i < resNumber.value; i++) {
		let pollResponse = pollResponses[i]
		let pollAnswer = {
			answer: pollResponse.answer,
			weight: pollResponse.weight,
			color: pollResponse.color
		}

		pollAnswers.push(pollAnswer)
	}
	customPoll.answers = pollAnswers

	socket.emit('savePoll', customPoll, editingPollId)
}

function savePollAs() {
	let customPoll = {}

	customPoll.name = prompt('What do you want to call this poll')

	customPoll.blind = blindCheck.checked
	customPoll.prompt = pollPrompt.value
	customPoll.textRes = resTextBox.checked
	customPoll.public = false
	customPoll.weight = 1

	var pollAnswers = []
	for (let i = 0; i < resNumber.value; i++) {
		let pollResponse = pollResponses[i]
		let pollAnswer = {
			answer: pollResponse.answer,
			weight: pollResponse.weight,
			color: pollResponse.color
		}

		pollAnswers.push(pollAnswer)
	}
	customPoll.answers = pollAnswers

	socket.emit('savePoll', customPoll)
}

function openSharePoll(customPollId) {
	currentSharePollId = customPollId
	socket.emit('getPollShareIds', customPollId)

	sharePollDialog.showModal()
}

function sharePoll(type) {
	if (type == 'user')
		socket.emit('sharePollToUser', currentSharePollId, sharePollUserInput.value)
	else if (type == 'class')
		socket.emit('sharePollToClass', currentSharePollId, sharePollClassInput.value)
	else alert('Invalid share poll type')

	sharePollUserInput.value = ''
	sharePollClassInput.value = ''
}

function deletePoll(pollId) {
	if (!pollId && !editingPollId) {
		alert('No poll selected')
		return
	}
	if (!pollId) {
		pollId = editingPollId
		unloadPoll()
	}

	socket.emit('deletePoll', pollId)
}

function insertCustomPolls(customPollsList, customPollsDiv, emptyText) {
	customPollsDiv.innerHTML = ''
	unnamedPolls = 0

	if (customPollsList.length == 0) {
		let noPolls = document.createElement('p')
		noPolls.textContent = emptyText
		customPollsDiv.appendChild(noPolls)
	}

	for (let customPollId of customPollsList) {
		let customPoll = customPolls[customPollId]

		if (!customPoll) continue

		let customPollDiv = document.createElement('div')
		customPollDiv.className = 'customPoll'

		let customPollName = document.createElement('p')
		customPollName.className = 'custom-poll-name'
		customPollName.style.gridColumn = 1
		if (customPoll.name)
			customPollName.textContent = customPoll.name
		else if (customPoll.prompt)
			customPollName.textContent = customPoll.prompt
		else {
			unnamedPolls++
			customPollName.textContent = 'Unnamed Poll'
		}
		customPollDiv.appendChild(customPollName)

		let editButton = document.createElement('button')
		editButton.className = 'edit-custom-poll'
		editButton.style.gridColumn = 2
		editButton.textContent = 'Edit'
		editButton.onclick = () => {
			editCustomPoll(customPollId)
		}
		customPollDiv.appendChild(editButton)

		let startButton = document.createElement('button')
		startButton.className = 'start-custom-poll'
		startButton.style.gridColumn = 3
		startButton.textContent = 'Start'
		startButton.onclick = () => {
			startPoll(customPollId)
		}
		customPollDiv.appendChild(startButton)

		if (customPoll.owner == currentUser.id) {
			let shareButton = document.createElement('button')
			shareButton.className = 'share-button'
			shareButton.style.gridColumn = 4
			shareButton.textContent = 'Share'
			shareButton.onclick = () => { openSharePoll(customPollId) }
			customPollDiv.appendChild(shareButton)

			let publicButton = document.createElement('button')
			publicButton.className = 'public-button'
			publicButton.style.gridColumn = 5
			if (customPoll.public)
				publicButton.textContent = 'Make Private'
			else
				publicButton.textContent = 'Make Public'
			publicButton.onclick = () => { publicToggle(customPollId) }
			customPollDiv.appendChild(publicButton)

			let deleteButton = document.createElement('button')
			deleteButton.className = 'delete-poll'
			deleteButton.style.gridColumn = 6
			deleteButton.textContent = 'Delete'
			deleteButton.onclick = () => { deletePoll(customPollId) }
			customPollDiv.appendChild(deleteButton)
		}

		customPollsDiv.appendChild(customPollDiv)
	}
}

// close all color pickers if you press escape
document.addEventListener('keydown', function (event) {
	if (event.key == 'Escape') {
		let colorPickersDiv = document.getElementsByClassName('colorPicker')
		for (let i = 0; i < colorPickersDiv.length; i++) {
			colorPickers[i].color.set(pollResponses[i].color)
			colorPickersDiv[i].style.display = 'none'
		}
	}
})

// close all color pickers if you click outside of them
document.addEventListener('click', (event) => {
	if (
		!event.target.closest('.colorPicker') &&
		!event.target.classList.contains('colorPickerButton')
	) {
		let colorPickersDiv = document.getElementsByClassName('colorPicker')
		for (let i = 0; i < colorPickers.length; i++) {
			colorPickers[i].color.set(pollResponses[i].color)
			colorPickersDiv[i].style.display = 'none'
		}
	}
})