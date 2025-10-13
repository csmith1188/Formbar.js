const selectPollDiv = document.querySelector('div#selectPoll')
let selectedClassTags = new Set() // Stores selected tags so they don't get reset when select buttons are recreated

// Creates the tag buttons in the select box
function createTagSelectButtons() {
	// Clear every tag in the select box
	for (const tag of selectPollDiv.children) {
		if (tag.className === 'switchAll revampButton') continue;
		tag.remove();
	}

	// Creation of tag buttons in the select box
	for (let i = 1; i <= currentTags.length; i++) {
		let tagPoll = document.createElement('button');
		tagPoll.className = selectedClassTags.has(currentTags[i - 1]) ? 'pressed revampButton' : 'tagPoll revampButton';
		tagPoll.textContent = currentTags[i - 1];
		tagPoll.name = currentTags[i - 1];

		// With every click creates an array with all clicked tags to compare with users
		tagPoll.onclick = () => {
			let tempTags = []
			if (tagPoll.className == 'tagPoll revampButton') {
				tagPoll.className = 'pressed revampButton';
				selectedClassTags.add(tagPoll.textContent);
			} else {
				tagPoll.className = 'tagPoll revampButton'
				selectedClassTags.delete(tagPoll.textContent);
			}

			for (let tag of document.querySelectorAll('#selectPoll button.pressed')) {
				tag = tag.textContent
				if (tag == "") {
					continue
				}
				tempTags.push(tag);
			}
			tempTags = tempTags.sort().join();

			// If the student has any of the selected tags, check the checkbox and open their menu
			const selectedStudents = []; // Stores the selected students
			for (const student of students) {
				const studentTags = student.tags;
				if (selectedClassTags.length === 0) continue;
				if (student.permissions >= TEACHER_PERMISSIONS) continue;

				// Handle poll response selections
				if (Array.isArray(student.pollRes.buttonRes)) { // Check if the poll is multi-res
					// Handle multi-res polls
					for (const response of student.pollRes.buttonRes) {
						if (selectedClassTags.has(response)) {
							const studentCheckbox = document.querySelector(`input[id="checkbox_${student.id}"]`);
							studentCheckbox.checked = true;
							studentCheckbox.dispatchEvent(new Event('change'));
							selectedStudents.push(student.email);
							break;
						}
					}
				} else if (typeof student.pollRes.buttonRes === 'string') {
					// Handle regular polls
					if (selectedClassTags.has(student.pollRes.buttonRes)) {
						const studentCheckbox = document.querySelector(`input[id="checkbox_${student.id}"]`);
						studentCheckbox.checked = true;
						studentCheckbox.dispatchEvent(new Event('change'));
						selectedStudents.push(student.id);
					}
				}

				// Handle tag selections
				for (const studentTag of studentTags) {
					if (selectedClassTags.has(studentTag)) {
						const studentCheckbox = document.querySelector(`input[id="checkbox_${student.id}"]`);
						studentCheckbox.checked = true;
						studentCheckbox.dispatchEvent(new Event('change'));
						selectedStudents.push(student.id);
						break;
					}
				}
			}

			// If the student is not selected, then unselect them
			for (const student of students) {
				if (selectedStudents.indexOf(student.id) === -1) {
					const studentElement = document.querySelector(`details[id="student-${student.id}"]`);
					const studentCheckbox = document.querySelector(`input[id="checkbox_${student.id}"]`);
					if (!studentCheckbox) continue; // If the student is offline or doesn't have a checkbox for some reason, ignore them

					studentElement.open = false;
					studentCheckbox.checked = false;
					studentCheckbox.dispatchEvent(new Event('change'));
				}
			}
		}

		if (selectPollDiv.children[i]) {
			selectPollDiv.children[i].replaceWith(tagPoll);
		} else {
			selectPollDiv.appendChild(tagPoll);
		}
	}
}


let pollHoverDiv = document.querySelector('div#pollPreview');
let hoverTimeoutBig = null;
let hoverCountBig = 500;
let pollDetailsDiv = document.getElementById('pollDetails');
pollDetailsDiv.addEventListener('mouseover', (e) => {
	if(orientation == 'portrait') return; // Don't show on landscape mode
	hoverTimeoutBig = setTimeout(() => {
		if(!classroom.poll.status) return; // Don't show if there is no active poll
		hoverShowPollDetails(classroom.poll, e, true);
		pollDetailsDiv.classList.add('tutorialDone');
		if(localStorage.getItem('controlTutorialDone') !== "true") {
			localStorage.setItem('controlTutorialDone', true);
		}

	}, hoverCountBig);
});
pollDetailsDiv.addEventListener('mouseout', () => {
	pollHoverDiv.className = 'revampDiv';
	clearTimeout(hoverTimeoutBig);
});

if(localStorage.getItem('controlTutorialDone') == "true") {
	pollDetailsDiv.classList.add('tutorialDone');
}

function hoverShowPollDetails(poll, event, isDetails = false) {
	pollHoverDiv.innerHTML = `<h1>${poll.prompt}</h1>`;

	if(!isDetails) {
		poll.answers.forEach((answer, index) => {
			pollHoverDiv.innerHTML += `<button class="revampButton" style="background: ${answer.color}44";>${answer.answer}</button>`
		});
	} else {
		Object.keys(poll.responses).forEach((answer, index) => {
			let answerDetails = poll.responses[answer];
			pollHoverDiv.innerHTML += `<button class="revampButton" style="background: ${answerDetails.color}44";>${answerDetails.answer}</button>`
		});
	}

	pollHoverDiv.style.setProperty('--mouseX', event.x - 300 + 'px');
	if(event.x - 300 < 0) pollHoverDiv.style.setProperty('--mouseX', event.x + 'px');
	pollHoverDiv.style.setProperty('--mouseY', event.y + 'px');
	pollHoverDiv.className = 'revampDiv open';
}

socket.emit('customPollUpdate')
socket.on('customPollUpdate', (
	newPublicCustomPolls,
	newClassroomCustomPolls,
	newUserCustomPolls,
	newCustomPolls
) => {
	publicCustomPolls = newPublicCustomPolls
	classroomCustomPolls = newClassroomCustomPolls
	userCustomPolls = newUserCustomPolls
	customPolls = newCustomPolls
	let publicPollsDiv = document.querySelector('div#publicPolls')
	let classPollsDiv = document.querySelector('div#classPolls')
	let userPollsDiv = document.querySelector('div#userPolls')
	let fastPollDiv = document.querySelector('div#quickPoll')

	// Creation of quick poll buttons in Fast Poll
	for (let i = 1; i <= 4; i++) {
		let customPoll = customPolls[i];
		let startButton = document.createElement('button')
		startButton.className = 'start-custom-poll revampButton'

		// Logic for showing poll details on hover
		let hoverTimeout = null;
		let hoverCount = 500;
		startButton.addEventListener('mouseover', (e) => {
			if(orientation == 'portrait') return; // Don't show on landscape mode
			hoverTimeout = setTimeout(() => { hoverShowPollDetails(customPoll, e) }, hoverCount);
		});
		startButton.addEventListener('mouseout', () => {
			pollHoverDiv.className = 'revampDiv';
			clearTimeout(hoverTimeout);
		});


		startButton.style.gridColumn = 3
		startButton.textContent = customPoll.name
		startButton.onclick = () => {
			startPoll(i);
		};
		if (fastPollDiv.children[i - 1]) {
			fastPollDiv.children[i - 1].replaceWith(startButton);
		} else {
			fastPollDiv.appendChild(startButton);
		}
	}
	selectPollDiv.innerHTML = ''
	
	// Creation of switchAll button
	const switchAll = document.createElement('button')
	switchAll.className = 'switchAll revampButton'
	switchAll.textContent = 'Switch All'

	function getStudentVotingEligibility() {
		const studentCheckboxes = document.querySelectorAll('input[name="studentCheckbox"]');
		let studentsChecked = 0;
		let studentsUnchecked = 0;
		for (const studentCheckbox of studentCheckboxes) {
			// Skip the template checkbox
			if (studentCheckbox.id == "checkbox_fake") {
				continue;
			}

			if (studentCheckbox.checked) {
				studentsChecked++;
			} else {
				studentsUnchecked++;
			}
		}

		return { studentsChecked, studentsUnchecked };
	}

	// Set the switch state to whether the majority of students are checked or unchecked
	switchAll.onclick = () => {
		const { studentsChecked, studentsUnchecked } = getStudentVotingEligibility();
		let switchState = studentsChecked > studentsUnchecked; // Check if the majority of student checkboxes are checked or unchecked
		switchState = !switchState;

		// Unselect all select tags
		selectedClassTags.clear();
		for (const tag of selectPollDiv.children) {
			if (tag.className === 'pressed') {
				tag.className = "tagPoll revampButton";
			}
		}

		const votingData = {};
		for (const student of Object.values(students)) {
			if (student.permissions >= TEACHER_PERMISSIONS) continue;

			const studentElement = document.querySelector(`details[id="student-${student.id}"]`);
			const studentCheckbox = document.querySelector(`input[id="checkbox_${student.id}"]`);

			if (studentCheckbox) {
				studentCheckbox.checked = switchState;
				studentCheckbox.dispatchEvent(new Event('change'));
				votingData[student.id] = switchState;
				studentElement.open = studentCheckbox.checked;
			}
		}

        // Send the voting data to the server to update the students' voting rights
		socket.emit('changeCanVote', votingData)
	}

	if (selectPollDiv.children[0]) {
		selectPollDiv.children[0].replaceWith(switchAll);
	} else {
		selectPollDiv.appendChild(switchAll);
	}

	for (const student of Object.values(students)) {
		// If the student is a teacher, skip them
		if (student.permissions >= TEACHER_PERMISSIONS) continue

		// Get the student's checkbox
		// If they do not have one, skip them
		const studentCheckbox = document.querySelector(`input[id="checkbox_${student.id}"]`)
		if (!studentCheckbox) continue;

		// When a student's checkbox is clicked, add all students who have their checkboxes checked to a list
		// Send this to the server to update student's voting rights
		studentCheckbox.onchange = () => {
			const canStudentVote = studentCheckbox.checked;

			let studentsAllowedToVote = classroom.poll.studentsAllowedToVote;
			if (studentCheckbox.checked && !studentsAllowedToVote.includes(student.id.toString())) {
				studentsAllowedToVote.push(student.id);
			}

			socket.emit('changeCanVote', {
				[student.id]: canStudentVote
			});
		}
	}

	createTagSelectButtons();
	insertCustomPolls(publicCustomPolls, publicPollsDiv, 'There are no public custom polls.')
	insertCustomPolls(classroomCustomPolls, classPollsDiv, 'This class has no custom polls.')
	insertCustomPolls(userCustomPolls, userPollsDiv, 'You have no custom polls.')
})

socket.on('getPollShareIds', (userPollShares, classPollShares) => {
	let userPollSharesDiv = document.getElementById('userPollShares')
	userPollSharesDiv.innerHTML = ''
	let classPollSharesDiv = document.getElementById('classPollShares')
	classPollSharesDiv.innerHTML = ''

	function addPollShare(socketName, pollName, id, pollsShareDiv) {
		let pollShareDiv = document.createElement('div')
		pollShareDiv.className = 'pollShare'
		pollShareDiv.style.display = 'flex'

		let name = document.createElement('p')
		name.textContent = pollName
		pollShareDiv.appendChild(name)

		let remove = document.createElement('button')
		remove.textContent = 'remove'
		remove.className = 'quickButton'
		remove.onclick = () => {
			socketName, currentSharePollId, id
			socket.emit(socketName, currentSharePollId, id)
		}
		pollShareDiv.appendChild(remove)

		pollsShareDiv.appendChild(pollShareDiv)
	}

	for (let pollShare of userPollShares) {
		addPollShare('removeUserPollShare', pollShare.email, pollShare.userId, userPollSharesDiv)
	}

	for (let pollShare of classPollShares) {
		addPollShare('removeClassPollShare', pollShare.name, pollShare.classId, classPollSharesDiv)
	}
})

socket.on("changeClassName", (name) => {
	className.innerHTML = `<b>Class Name:</b> ${name}`;
})

socket.on("classPollSave", (pollId) => {
	socket.emit("sharePollToClass", pollId, classId);
})

let selectTags = document.createElement('dialog')
let closeTags = document.createElement('button');
let selectTagForm = document.createElement('form');
selectTagForm.setAttribute('name', 'selectTagForm');

function rebuildSelectTagForm() {
    selectTagForm.innerHTML = '';
    const classTags = Array.isArray(classroom.tags) ? classroom.tags : [];
    for (let i = 0; i < classTags.length; i++) {
		let checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.name = `tagSelector`;
		checkbox.id = `tagSelector${classTags[i]}`
		checkbox.value = classTags[i];

		let label = document.createElement('label');
		label.textContent = classTags[i];
		label.setAttribute('for', `checkbox${i}`);

		selectTagForm.appendChild(checkbox);
		selectTagForm.appendChild(label);
		selectTagForm.appendChild(document.createElement('br'));
	}

	let tagsAllSame = document.createElement('input');
	tagsAllSame.type = 'checkbox';
	tagsAllSame.value = 0 + ':Exact Same Tags'
	tagsAllSame.name = 'tagSelector';

	let tagsHas = document.createElement('input');
	tagsHas.type = 'checkbox';
	tagsHas.value = 1 + ':Has The Tags'
	tagsHas.name = `tagSelector`;

	let tagsAllSameLabel = document.createElement('label');
	let tagsHasLabel = document.createElement('label');
	tagsAllSameLabel.textContent = `Exact Same Tags`;
	tagsHasLabel.textContent = 'Has The Tags';
	tagSelectorParagraph = document.createElement('p');
	tagSelectorParagraph.textContent = 'Pick One Below:';
	selectTagForm.appendChild(tagSelectorParagraph)
	selectTagForm.appendChild(tagsAllSame);
	selectTagForm.appendChild(tagsAllSameLabel);
	selectTagForm.appendChild(document.createElement('br'));
	selectTagForm.appendChild(tagsHas);
	selectTagForm.appendChild(tagsHasLabel);
	selectTagForm.appendChild(document.createElement('br'));
}

rebuildSelectTagForm();
selectTags.appendChild(selectTagForm);
selectTags.appendChild(document.createElement('br'));
selectTags.appendChild(closeTags);
document.body.appendChild(selectTags);
closeTags.textContent = 'Save';

// When the close button is clicked, close the dialog
closeTags.addEventListener('click', function () {
	selectTags.close();
})

socket.emit('classBannedUsersUpdate')
socket.on('classBannedUsersUpdate', (bannedStudents) => {
	let bannedDiv = document.querySelector('#bannedMenu.tabContent')
	bannedDiv.innerHTML = ''

	for (let bannedStudent of bannedStudents) {
		let bannedStudentDiv = document.createElement('div')
		bannedStudentDiv.className = 'bannedStudent'
		bannedStudentName = document.createElement('p')
		bannedStudentName.textContent = bannedStudent
		bannedStudentDiv.appendChild(bannedStudentName)
		unban = document.createElement('button')
		unban.textContent = 'unban'
		unban.className = 'quickButton'
		unban.onclick = () => {
			socket.emit('classUnbanUser', bannedStudent)
		}
		bannedStudentDiv.appendChild(unban)
		document.querySelector('#bannedMenu.tabContent').appendChild(bannedStudentDiv)
	}
})

// Handle callback for when a polls are created or ended
socket.on('startPoll', () => {
	endPoll.style.display = 'block'
	changeTab('usersMenu', 'mainTabs')
})

socket.on('endPoll', () => {
	endPoll.style.display = 'none'
})


// Handle sound events
const socketSounds = {
	'pollSound': new Audio('/sfx/TUTD.wav'),
	'removePollSound': new Audio('/sfx/remove.wav'),
	'breakSound': new Audio('/sfx/break.wav'),
	'helpSound': new Audio('/sfx/help.wav'),
	'timerSound': new Audio('/sfx/alarmClock.mp3'),
	'joinSound': new Audio('/sfx/join.wav'),
	'leaveSound': new Audio('/sfx/leave.wav')
};

function playSound(sound) {
	try {
		// If the sound isn't muted, play it
		if (!mute) {
			sound.play();
		}
	} catch (err) {}
}

for (const socketName in socketSounds) {
	const sound = socketSounds[socketName];
	socket.on(socketName, () => {
		playSound(sound);
	});
}