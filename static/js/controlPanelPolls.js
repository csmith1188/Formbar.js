function load(pollStatus) {
	if (pollStatus) {
		clearPoll.style.display = 'block'
		endPoll.style.display = 'block'
	} else {
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

function responseAmountChange(responseAmount = null) {
	responseDivs = document.getElementsByClassName('response')
	if(responseAmount) resNumber.value = responseAmount;
	if (resTextBox.checked) {
		if (resNumber.value < 0) resNumber.value = 0
	}
	else {
		if (resNumber.value < 1) resNumber.value = 1
	}
	if (resNumber.value > 26) resNumber.value = 26

	generatedColors = generateColors(resNumber.value)
	if (pollResponses.length > resNumber.value) {

		responseDivs = document.getElementsByClassName('response')
		for (let i = resNumber.value; i < pollResponses.length; i++) {
			document.getElementById(`response${i}`).remove()
		}

		pollResponses.splice(resNumber.value)
		colorPickers.splice(resNumber.value)
	}

	for (let responseDiv of responseDivs) {
		let i = responseDiv.id.split('response')[1];
		pollResponses[i].defaultAnswer = letterString[i];
		if (responseDiv) {
			responseDiv.placeholder = `Answer ${letterString[i]}`;
		};
	};

	for (let i = pollResponses.length; i < resNumber.value; i++) {
		pollResponses.push({
			answer: '',
			defaultAnswer: letterString[i],
			color: '',
			defaultColor: generateColors[i],
			weight: 1,
			defaultWeight: 1
		})

		//if (!document.getElementById(`response${i}`)) {
		//let nextResponse = document.getElementById(`response${i + 1}`);
		//nextResponse.id = `response${i}`;
		//};

		let responseDiv = document.createElement('div')
		responseDiv.className = 'response'
		responseDiv.id = `response${i}`

		let colorPickerButton = document.createElement('button')
		colorPickerButton.className = 'colorPickerButton revampButton'
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
		colorPickerDiv.className = 'colorPicker revampDiv'

		let buttonsDiv = document.createElement('div')
		buttonsDiv.className = 'buttonsDiv'

		let saveColorButton = document.createElement('button')
		saveColorButton.className = 'quickButton revampButton'
		//saveColorButton.style.width = "100px"
		saveColorButton.textContent = 'Save Color'
		saveColorButton.onclick = () => {
			saveColor(i)
		}
		buttonsDiv.appendChild(saveColorButton)

		let resetColor = document.createElement('button')
		resetColor.className = 'quickButton revampButton warningButton'
		//resetColor.style.width = "100px"
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

		let hexLabel = document.createElement('label')
		hexLabel.className = 'hexLabel'
		hexLabel.textContent = 'Hex '
		let hexInput = document.createElement('input')
		hexInput.className = 'hexInput revampButton revampWithText'
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
		answerName.className = 'answerName revampButton revampWithText'
		answerName.name = 'answerName'
		answerName.placeholder = `Answer ${String.fromCharCode(i + 97)} `
		answerName.value = ''
		answerName.onchange = (event) => {
			pollResponses[i].answer = event.target.value;
		}
		responseDiv.appendChild(answerName)

		let answerWeight = document.createElement('input')
		answerWeight.type = 'number'
		answerWeight.className = 'answerWeight revampButton revampWithText'
		answerWeight.name = 'answerWeight'
		answerWeight.step = '0.1';
		answerWeight.placeholder = `Weight`
		answerWeight.value = 1
		answerWeight.onkeydown = (event) => {
			if(isFinite(event.key)) return;
			if(
				event.key === '.' ||
				event.key === 'Backspace' ||
				event.key === 'Delete' ||
				event.key === 'Tab' ||
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowRight') return;
			else event.preventDefault();
		}
		answerWeight.onchange = (event) => {
			if(/^\d*\.?\d*$/.test(event.target.value)) {
				pollResponses[i].weight = parseFloat(event.target.value);
			} else {
				answerWeight.value = pollResponses[i].weight;
			}
		}
		responseDiv.appendChild(answerWeight)

		let removeAnswerButton = document.createElement("button");
		removeAnswerButton.className = "quickButton revampButton warningButton";
		removeAnswerButton.innerHTML = "<img src='/img/close-outline.svg' alt='Remove Answer' />";
		removeAnswerButton.id = `removeAnswer`;
		removeAnswerButton.onclick = removeAnswer;
		responseDiv.appendChild(removeAnswerButton);

		responsesDiv.appendChild(responseDiv)

		FloatingUIDOM.autoUpdate(
			colorPickerButton,
			colorPickerDiv,
			() => {
				FloatingUIDOM.computePosition(colorPickerButton, colorPickerDiv, {
					placement: 'right-end',
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

		colorPickers[i].base.appendChild(colorsDiv)

		colorPickers[i].on(['color:init', 'color:change'], color => {
			let newColor = colorPickers[i].base.getElementsByClassName('newColor')[0]
			let hexInput = responseDiv.getElementsByClassName('hexInput')[0]

			
			newColor.style.backgroundColor = color.hexString
			hexInput.value = color.hexString.substring(1)
		})
	}

	responseDivs = document.getElementsByClassName('response')
	for (let i = 0; i < responseDivs.length; i++) {
		let responseDiv = responseDivs[i]
		let colorPickerButton = responseDiv.getElementsByClassName('colorPickerButton')[0]
		let oldColor = colorPickers[i].base.getElementsByClassName('oldColor')[0]

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

function showGeneralOptions() {
	if (generalOptionsDiv.hidden) {
		generalOptionsDiv.hidden = false;
	} else {
		generalOptionsDiv.hidden = true;
	};
};

function addAnswer() {
	resNumber.value = parseInt(resNumber.value) + 1;
	responseAmountChange();
};

function removeAnswer(event) {
	let element = event.target.parentElement;

	if(responsesDiv.childElementCount == 1) { 
        let removeOnly = confirm("Are you sure you want to remove the only response?");

        if(!removeOnly) return;
    }

	let elementId = element.id.split('response')[1];
	element.remove();
	pollResponses.splice(elementId, 1);
	responseDivs = document.getElementsByClassName('response');
	answerNames = document.getElementsByClassName('answerName');
	for (let i = 0; i < responseDivs.length; i++) {
		responseDivs[i].id = `response${i}`;
		answerNames[i].placeholder = `Answer ${letterString[i]}`;
	};
	resNumber.value = parseInt(resNumber.value) - 1;
};

// Ends the poll and reloads the users page to stop any more submission
function clearPollFunc() {
	socket.emit('clearPoll')
	clearPoll.style.display = 'none'
}

function endPollFunc() {
	socket.emit('endPoll')
	socket.emit('getPreviousPolls', currentPreviousPollIndex);
}

// Starts a new poll that allows students to submit answers
// Check how many possible responses and if the teacher wants to accept text responses\
function startPoll(customPollId) {
	let userTags = []
	let userBoxesChecked = []
	let userIndeterminate = []
	let pollAnswers = []
	for (let i = 0; i < resNumber.value; i++) {
		let pollResponse = pollResponses[i]
		let pollAnswer = {
			answer: (pollResponse.answer) ? pollResponse.answer : pollResponse.defaultAnswer,
			weight: pollResponse.weight,
			color: (pollResponse.color) ? pollResponse.color : pollResponse.defaultColor
		}
		pollAnswer.answer = pollAnswer.answer.replaceAll('"', '“')
		pollAnswer.answer = pollAnswer.answer.replaceAll(',', '‚')
		pollAnswers.push(pollAnswer)
	}
	let multiRes = document.getElementById("multiRes")
	let selectTagForm = document.getElementsByName('selectTagForm')
	let allCheckboxes = document.getElementsByName('studentCheckbox')
	for (let eachTagForm of selectTagForm[0]) {
		if (eachTagForm.checked) {
			//for each tag checked on the teacher's side to determine who can answer the poll, add it to the userTags array
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

	if(!classroom.isActive) return alert("Please start the class before starting a poll.");

	if (customPollId) {
		let customPoll
		if(customPollId == "current") {
			customPoll = {
				prompt: pollPrompt.value,
				blind: blindCheck.checked,
				textRes: resTextBox.checked,
				multiRes: multiRes.checked,
				answers: pollAnswers,
				weight: 1,
				indeterminate: userIndeterminate
			}
		}
		else customPoll = customPolls[customPollId]
		changeTab('mainPolls', 'polls')

        socket.emit('startPoll', {
            prompt: customPoll.prompt,
            answers: customPoll.answers,
            allowTextResponses: !!customPoll.textRes,
            allowMultipleResponses: customPoll.multiRes,
            blind: !!customPoll.blind,
            weight: customPoll.weight,
            tags: userTags,
            indeterminate: customPoll.indeterminate,
            studentsAllowedToVote: userBoxesChecked,
        });
	} else {
		let blind = blindCheck.checked

        socket.emit('startPoll', {
            prompt: pollPrompt.value,
            answers: pollAnswers,
            allowTextResponses: resTextBox.checked,
            allowMultipleResponses: multiRes.checked,
            blind: !!blind,
            weight: 1,
            tags: userTags,
            indeterminate: userIndeterminate,
            studentsAllowedToVote: userBoxesChecked,
        });
    }
	clearPoll.style.display = 'block'
	endPoll.style.display = 'block'
	changeTab('usersMenu', 'mainTabs')
};

function editCustomPoll(customPollId) {
	editingPollId = customPollId
	let customPoll = customPolls[editingPollId]

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
}

function unloadPoll() {
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
	customPoll.prompt = prompt.value
	customPoll.textRes = resTextBox.checked

	let pollAnswers = []
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

function savePollAs(pollType) {
	let customPoll = {}

	customPoll.name = prompt('What do you want to call this poll')
	if (!customPoll.name) {
		return;
	} else {
		customPoll.blind = blindCheck.checked
		customPoll.prompt = pollPrompt.value
		customPoll.textRes = resTextBox.checked
		customPoll.public = false
		customPoll.weight = 1

		let pollAnswers = []
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

		if (pollType == 'user') socket.emit('savePoll', customPoll);
		else if (pollType == 'class') socket.emit('classPoll', customPoll);
	};
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
	let elems = document.querySelectorAll(`.custom-poll-name`)

	if (!customPolls[pollId]) {
		alert('No poll found.')
		return
	}

	if (!pollId) {
		alert('No poll selected')
		return
	}
	
	//if (!pollId) {
	//	pollId = editingPollId
	//	unloadPoll()
	//}

	if(confirm(`Are you sure you would like to delete the poll "${customPolls[pollId].name}"?`)) 
	{ 
		for (elem of elems) {
			if (elem.innerHTML == customPolls[pollId].name) elem.parentElement.remove()
		}
		socket.emit('deletePoll', pollId) 
	};
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
		customPollDiv.className = 'customPoll revampDiv'

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

        let buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'customPollButtons'

		let deleteButton = document.createElement('button')
		deleteButton.className = 'edit-custom-poll revampButton warningButton'
		deleteButton.style.gridColumn = 2
		deleteButton.textContent = 'Delete'
		deleteButton.onclick = () => {
			deletePoll(customPollId)
		}
		if(customPollsDiv.id !== "publicPolls") buttonsDiv.appendChild(deleteButton)

		let editButton = document.createElement('button')
		editButton.className = 'edit-custom-poll revampButton'
		editButton.style.gridColumn = 2
		editButton.textContent = 'Edit'
		editButton.onclick = () => {
			changeTab('newPoll', 'polls')
			editCustomPoll(customPollId)
		}
		buttonsDiv.appendChild(editButton)

		let startButton = document.createElement('button')
		startButton.className = 'start-custom-poll revampButton acceptButton'
		startButton.style.gridColumn = 3
		startButton.textContent = 'Start'
		startButton.onclick = () => {
			startPoll(customPollId)
		}
		buttonsDiv.appendChild(startButton)

        customPollDiv.appendChild(buttonsDiv);

		if (customPoll.owner == currentUser.id) {
			// let shareButton = document.createElement('button')
			// shareButton.className = 'share-button'
			// shareButton.style.gridColumn = 4
			// shareButton.textContent = 'Share'
			// shareButton.onclick = () => { openSharePoll(customPollId) }
			// customPollDiv.appendChild(shareButton)

			// let publicButton = document.createElement('button')
			// publicButton.className = 'public-button'
			// publicButton.style.gridColumn = 5
			// if (customPoll.public)
			// 	publicButton.textContent = 'Make Private'
			// else
			// 	publicButton.textContent = 'Make Public'
			// publicButton.onclick = () => { publicToggle(customPollId) }
			// customPollDiv.appendChild(publicButton)
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

// Close all color pickers if you click outside of them
document.addEventListener('click', (event) => {
	if (
		!event.target.closest('.colorPicker') &&
		!event.target.classList.contains('colorPickerButton')
	) {
		let colorPickersDiv = document.getElementsByClassName('colorPicker')
		for (let i = 0; i < colorPickers.length; i++) {
			if (!colorPickersDiv[i]) {
				return;
			};
			colorPickers[i].color.set(pollResponses[i].color)
			colorPickersDiv[i].style.display = 'none'
		}
	}
	if(
		!event.target.closest('details.controlStudent') &&
		!event.target.classList.contains('controlStudent')
	) {
		let controlStudents = document.getElementsByClassName('controlStudent')
		for(let controlStudent of controlStudents) {
			controlStudent.open = false
		}
	}
})

//Make the code above work

let time = document.getElementsByClassName('inputtedTime')[0]
let timeS = document.getElementsByClassName('inputtedTime')[1]

let timerButton = document.getElementById('timerButton')
timerButton.addEventListener('click', function () {
	if ((timeS.value == '' || timeS.value == 0) && (time.value == 0 || time.value == '')) {
		alert('Please enter a time')
		return
	}
	socket.emit("timer", time.value * 60 + Number(timeS.value), true)
	timerButton.hidden = true
	timerStopButton.hidden = false
})

let timerStopButton = document.getElementById('timerStopButton')
timerStopButton.addEventListener('click', function () {
	timerButton.hidden = false
	time.value = ''
	timeS.value = ''
	timerStopButton.hidden = true
	socket.emit("timer", { turnedOn: false })
})

// If there is an active timer after refreshing the page, show the stop button
socket.emit('timerOn')
socket.on('timerOn', function (time) {
	if (time) {
		timerButton.hidden = true
		timerStopButton.hidden = false
	} else {
		timerButton.hidden = false
		timerStopButton.hidden = true
	}
})
