socket.emit('cpUpdate')
let currentTags = []
let students = []
socket.on('cpUpdate', (newClassroom) => {
	currentTags = []
	let Offline = 0
	for (let student of Object.values(newClassroom.students)) {
		student.help.time = new Date(student.help.time)
		student.pollRes.time = new Date(student.pollRestime)
		let studentTags = student.tags
		if (student.tags == null || student.tags == "") {
			studentTags = ""
		}
		if (studentTags.includes("Offline")) {
			Offline++
		}
		studentTags = studentTags.split(",")
		for (let tag of studentTags) {
			if (!currentTags.includes(tag) && tag != "" && tag !="Offline") {
				currentTags.push(tag)
			}
		}
		if (student.pollRes.buttonRes != null && student.pollRes.buttonRes != "") {
			let tempArr = []
			if (typeof student.pollRes.buttonRes == 'object') tempArr = student.pollRes.buttonRes
			else tempArr = student.pollRes.buttonRes.split(",")

			for (let res of tempArr) {
				if (currentTags.includes(res) || res == "" || res == "remove") {
					continue
				}
				currentTags.push(res)
			}
		}

		if (students.length > 0) {
			for (let i = 0; i < students.length; i++) {
				if (students[i].username == student.username) {
					students[i] = student
					break
				}
				if (i == students.length - 1) {
					students.push(student)
				}
			}
		} else {
			students.push(student)
		}
	}
	
	className.textContent = `Class Name: ${newClassroom.className}`
	classCode.textContent = `Class Code: ${newClassroom.key}`
	// classId.textContent = `Class ID: ${newClassroom.id}`

	totalUsers.innerText = `Users: ${Object.keys(newClassroom.students).length - Offline - 1}`
	if (newClassroom.poll.prompt != "") {
		pollCounter.innerText = `Poll Prompt:'${newClassroom.poll.prompt}'`
	} else {
		pollCounter.innerText = `Poll Prompt:`
	}

	let responseCount = 0;
	let totalResponders = 0;
	for (let [studentName, student] of Object.entries(newClassroom.students)) {
		// If the student is offline, on break, a guest, or a teacher, do not include them as a potential responder
		if ((!student.tags || !student.tags.includes("Offline")) 
			&& !student.break 
			&& student.permissions > GUEST_PERMISSIONS 
			&& student.permissions < TEACHER_PERMISSIONS
			&& newClassroom.poll.studentBoxes.includes(student.username)
		) {
			totalResponders++;
		}

		// If the student has responded to the poll, increment the response count
		if (student.pollRes.buttonRes != "" || student.pollRes.textRes != "") {
			responseCount++;
		}
	}

	responsesCounter.innerText = `Total Responses: ${responseCount} out of ${totalResponders}`;

	for (const username of Object.keys(newClassroom.students)) {
		let studentElement = document.getElementById(`student-${username}`)
		let oldStudentData = null
		let newStudentData = newClassroom.students[username]

		// Add any selected tags to the current tags list
		// This will allow the teacher to filter students by tags
		if (newStudentData.tags) {
			for (const tag of newStudentData.tags.split(',')) {
				if (!currentTags.includes(tag) && tag !== "" && tag !== "Offline") {
					currentTags.push(tag)
				}
			}
		}

		if (classroom.students && classroom.students[username]) oldStudentData = classroom.students[username]
		if (!studentElement) {
			let builtStudent = buildStudent(newClassroom, newStudentData)
			if (builtStudent) usersDiv.appendChild(builtStudent)
			continue
		}

		if (deepObjectEqual(oldStudentData, newStudentData)) continue

		studentElement.replaceWith(buildStudent(newClassroom, newStudentData))
	}

	totalUsers.innerText = `Users: ${Object.keys(newClassroom.students).length - Offline - 1}`

	for (let studentElement of document.getElementsByClassName('student')) {
		if (!newClassroom.students[studentElement.id.replace('student-', '')]) {
			studentElement.remove()
		}
	}

	// Commented because the banned tab is not used/functioning
	// @TODO: Fix the banned tab
	// if (currentUser.classPermissions >= newClassroom.permissions.manageStudents) {
	// 	bannedTabButton.style.display = ''
	// } else {
	// 	bannedTabButton.style.display = 'none'

	// 	if (bannedTabButton.classList.contains('pressed')) {
	// 		changeTab('usersMenu', 'mainTabs')
	// 	}
	// }

	if (currentUser.classPermissions >= newClassroom.permissions.controlPolls) {
		pollsTabButton.style.display = ''
	} else {
		pollsTabButton.style.display = 'none'

		if (pollsTabButton.classList.contains('pressed')) {
			changeTab('usersMenu', 'mainTabs')
		}
	}

	if (currentUser.classPermissions >= newClassroom.permissions.manageClass) {
		settingsTabButton.style.display = ''
	} else {
		settingsTabButton.style.display = 'none'

		if (settingsTabButton.classList.contains('pressed')) {
			changeTab('usersMenu', 'mainTabs')
		}
	}

	if (currentUser.classPermissions >= MANAGER_PERMISSIONS) {
		permissionsTabButton.style.display = ''
	} else {
		permissionsTabButton.style.display = 'none'

		if (permissionsTabButton.classList.contains('pressed')) {
			changeTab('plugins', 'settingsTabs')
		}
	}

	if (classroom?.poll?.status != newClassroom.poll.status) {
		if (newClassroom.poll.status) {
			responsesDiv.style.display = 'none'
			startPollForm.style.display = 'none'
			endPoll.style.display = 'block'
		} else {
			responsesDiv.style.display = ''
			startPollForm.style.display = ''
			endPoll.style.display = 'none'
		}
	}


	if (!deepObjectEqual(classroom?.permissions, newClassroom.permissions)) {
		permissionsDiv.innerHTML = ''
		for (let [permission, level] of Object.entries(newClassroom.permissions)) {
			let permissionLabel = document.createElement('label')
			permissionLabel.textContent = camelCaseToNormal(permission)
			let permissionSelect = document.createElement('select')
			permissionSelect.className = 'permissionSelect'
			permissionSelect.id = permission
			permissionSelect.onchange = (event) => {
				let select = event.target
				socket.emit('setClassPermissionSetting', select.id, select.options[select.selectedIndex].value)
			}
			let ownerOption = document.createElement('option')
			ownerOption.value = 5
			ownerOption.selected = level == 5
			ownerOption.textContent = 'Owner'
			permissionSelect.appendChild(ownerOption)
			let teacherOption = document.createElement('option')
			teacherOption.value = 4
			teacherOption.selected = level == 4
			teacherOption.textContent = 'Teacher'
			permissionSelect.appendChild(teacherOption)
			let modOption = document.createElement('option')
			modOption.value = 3
			modOption.selected = level == 3
			modOption.textContent = 'Mod'
			permissionSelect.appendChild(modOption)
			let studentOption = document.createElement('option')
			studentOption.value = 2
			studentOption.selected = level == 2
			studentOption.textContent = 'Student'
			permissionSelect.appendChild(studentOption)
			let guestOption = document.createElement('option')
			guestOption.value = 1
			guestOption.selected = level == 1
			guestOption.textContent = 'Guest'
			permissionSelect.appendChild(guestOption)
			permissionLabel.appendChild(permissionSelect)
			permissionsDiv.appendChild(permissionLabel)
		}
	}

	if (!deepObjectEqual(classroom?.tagNames, newClassroom.tagNames)) {
		for (let tag of newClassroom.tagNames) addTagElement(tag)
		
		let newTagDiv = document.createElement('div')
		let newTag = document.createElement('textarea')
		newTag.type = 'text'
		newTag.placeholder = 'Add Tag, Or Multiple'

		let addTagButton = document.createElement('button')
		addTagButton.textContent = '✔'
		addTagButton.onclick = () => {
			if (newTag.value.includes(',')) {
				let tags = newTag.value.split(',')

				for (let tag of tags) {
					addTagElement(tag.trim())
				}
			} else {
				addTagElement(newTag.value)
			}
			newTag.value = ''

			// When a new tag is added, send the new tags to the server
			sendTags()
			updateStudentTags()
		}

		newTagDiv.appendChild(newTag)
		newTagDiv.appendChild(addTagButton)

		tagOptionsDiv.appendChild(newTagDiv)
	}

	filterSortChange(newClassroom)

	classroom = newClassroom
	socket.emit('customPollUpdate')
})

function getTags() {
	const tags = [];
	for (let tag of tagsDiv.children) {
		if (tag.value === "" || tag.value === "Offline") continue;
		tags.push(tag.value);
	}
	return tags;
}

// Sends the tags to the server
function sendTags() {
	const tags = getTags();
	socket.emit('setTags', tags);
}

// Creates a tag element in the tag div
function addTagElement(tag) {
	if (tag == "" || tag == "Offline" || tag == null) return
	let tagOption = document.createElement('div')
	tagOption.value = tag
	tagOption.textContent = tag

	let removeButton = document.createElement('button')
	removeButton.textContent = '✖'
	removeButton.onclick = () => {
		tagsDiv.removeChild(tagOption)
		sendTags()
		updateStudentTags()
	}
	tagOption.appendChild(removeButton)
	tagsDiv.appendChild(tagOption)
}

// Update the tag buttons for each student
function updateStudentTags() {
	const tags = getTags();
	for (const student of usersDiv.children) {
		// Get student tag elements
		const roomTags = student.querySelector('#roomTags');
		const studTagsSpan = student.querySelector('#studentTags');
		const username = student.id.split('-')[1];
		const studentData = students.find((student) => student.username === username);

		// Get tags selected before the update
		const oldTags = [];
		if (roomTags) {
			for (let tagButton of roomTags.querySelectorAll('button.pressed')) {
				oldTags.push(tagButton.textContent);
			}
		}

		// Clear room tags
		if (studTagsSpan) studTagsSpan.innerHTML = '';
		roomTags.innerHTML = '';

		// If the student has tags, check if it's a valid tag in tagsDiv children
		// If it's not, then remove the tag from the studentData tags
		if (studentData && studentData.tags) {
			for (const tag of studentData.tags.split(',')) {
				const tagElement = Array.from(tagsDiv.children).find((tagElement) => tagElement.value === tag);
				if (!tagElement) {
					studentData.tags = studentData.tags.split(',').filter(t => t !== tag).join(',');
				}
			}
		}

		for (const tag of tags) {
			let button = document.createElement('button');
			button.innerHTML = tag
			button.name = `button${tag}`;
			button.value = tag;
			button.onclick = function () {
				if (!button.classList.contains('pressed')) {
					console.log('called pressed')
					button.classList.add('pressed')
					let span = document.createElement('span');
					span.textContent = tag;
					span.setAttribute('id', tag);
					if (studTagsSpan) studTagsSpan.appendChild(span);

					// If the studentData does not have tags, add the tag
					if (studentData.tags) {
						studentData.tags = `${studentData.tags},${tag}`;
					} else {
						studentData.tags = tag;
					}

					// Add to current tags
					if (!currentTags.includes(span.textContent)) {
						currentTags.push(span.textContent);
					}
				} else {
					console.log('called not pressed')
					button.classList.remove('pressed')

					// Remove from current tags if no other user has the tag
					if (currentTags.includes(tag) && !document.querySelector(`button[value="${tag}"].pressed`)) {
						currentTags.splice(currentTags.indexOf(tag), 1);
					}

					// Remove the tag from the studentData tags
					if (studentData) {
						studentData.tags = studentData.tags.split(',').filter(t => t !== tag).join(',');
					}

					if (studTagsSpan) {
						const tagSpan = studTagsSpan.querySelector(`#${tag}`);
						tagSpan.remove();
					}
				}

				// When someone clicks on a tag, save the tags to the server
				const tags = [];
				if (roomTags) {
					for (let tagButton of roomTags.querySelectorAll('button.pressed')) {
						tags.push(tagButton.textContent);
					}
					socket.emit('saveTags', studentData.id, tags, studentData.username);
				}

				createTagSelectButtons();
			}

			for (const oldTag of oldTags) {
				if (oldTag == tag) {
					button.classList.add('pressed')
				}
			}

			roomTags.appendChild(button);
		}
	}
}

const selectPollDiv = document.querySelector('div#selectPoll')

// Creates the tag buttons in the select box
function createTagSelectButtons() {
	// Clear every tag in the select box
	for (const tag of selectPollDiv.children) {
		if (tag.className === 'switchAll') continue;
		tag.remove();
	}

	// Creation of tag buttons in the select box
	for (let i = 1; i <= currentTags.length; i++) {
		let tagPoll = document.createElement('button');
		tagPoll.className = 'tagPoll';
		tagPoll.textContent = currentTags[i - 1];
		tagPoll.name = currentTags[i - 1];

		// With every click creates an array with all clicked tags to compare with users
		tagPoll.onclick = () => {
			let tempTags = []
			if (tagPoll.className == 'tagPoll') {
				tagPoll.className = 'pressed';
			} else {
				tagPoll.className = 'tagPoll'
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
			for (let student of students) {
				let studElem = document.querySelector(`details[id="student-${student.username}"]`)
				if (student.permissions >= TEACHER_PERMISSIONS) continue
				// Combines the students tags and their poll responses
				let tempStudTags = []
				if (student.tags == null) {
					continue
				}
				for (let tag of studElem.querySelectorAll('#studentTags span')) {
					tag = tag.textContent
					if (tag == "") {
						continue
					}
					tempStudTags.push(tag)
				}
				for (let tag of studElem.querySelectorAll('#response')) {
					tag = tag.textContent
					if (tag == "" || tag == "remove") {
						continue
					}
					tempStudTags.push(tag)
				}
				tempStudTags = tempStudTags.sort().join();

				let checkbox = studElem.querySelector('input[type="checkbox"]')

				if (!student.break && (tempStudTags == tempTags || tempTags == "")) {
					studElem.open = true
					if (!checkbox.checked) checkbox.click()
				} else {
					studElem.open = false
					if (checkbox.checked) checkbox.click()
				}

				socket.emit('votingRightChange', student.username, votingRight = checkbox.checked)
			}
		};

		if (selectPollDiv.children[i]) {
			selectPollDiv.children[i].replaceWith(tagPoll);
		} else {
			selectPollDiv.appendChild(tagPoll);
		}
	}
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
		let customPoll = customPolls[i]
		let startButton = document.createElement('button')
		startButton.className = 'start-custom-poll'
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
	let switchAll = document.createElement('button')
	switchAll.className = 'switchAll'
	switchAll.textContent = 'Switch All'

	let switchState = document.querySelector(`input[name="studentCheckbox"]`).checked
	switchAll.onclick = () => {
		switchState = !switchState

		for (let student of Object.values(students)) {
			if (student.permissions >= TEACHER_PERMISSIONS) continue

			let studElem = document.querySelector(`details[id="student-${student.username}"]`)
			let studCheck = document.querySelector(`input[id="checkbox_${student.username}"]`)

			if (studCheck.checked != switchState) {
				studCheck.click()
			}
			studElem.open = studCheck.checked
		}
	};
	if (selectPollDiv.children[0]) {
		selectPollDiv.children[0].replaceWith(switchAll);
	} else {
		selectPollDiv.appendChild(switchAll);
	}

	for (let student of Object.values(students)) {
		if (student.permissions >= TEACHER_PERMISSIONS) continue

		let studCheck = document.querySelector(`input[id="checkbox_${student.username}"]`)
		if (!studCheck) continue;
		studCheck.onclick = () => {
			let votingRight = studCheck.checked
			let studBox = classroom.poll.studentBoxes
			if (studCheck.checked) {
				if (!studBox.includes(student.username)) studBox.push(student.username)
			} else {
				studBox = studBox.filter((box) => box != student.username)
			}
			studBox = studBox.sort()
			socket.emit('votingRightChange', student.username, votingRight, studBox)
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
		addPollShare('removeUserPollShare', pollShare.username, pollShare.userId, userPollSharesDiv)
	}

	for (let pollShare of classPollShares) {
		addPollShare('removeClassPollShare', pollShare.name, pollShare.classId, classPollSharesDiv)
	}
})

socket.on("classPollSave", (pollId) => {
	const classId = classId.textContent.split(": ")[1];
	socket.emit("sharePollToClass", pollId, classId);
})

var selectTags = document.createElement('dialog')
let closeTags = document.createElement('button');
let selectTagForm = document.createElement('form');
selectTagForm.setAttribute('name', 'selectTagForm');
tagNames = tagNames.split(",");
//create the form on the poll's settings page to select tags as requirements
for (let i = 0; i < tagNames.length; i++) {
	let checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.name = `tagSelector`;
	checkbox.id = `tagSelector${tagNames[i]}`
	checkbox.value = tagNames[i];
	let label = document.createElement('label');
	label.textContent = tagNames[i];
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
selectTags.appendChild(selectTagForm);
selectTags.appendChild(document.createElement('br'));
selectTags.appendChild(closeTags);
document.body.appendChild(selectTags);
closeTags.textContent = 'Save';
//When the close button is clicked, close the dialog
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

socket.on('startPoll', () => {
	responsesDiv.style.display = 'none'
	startPollForm.style.display = 'none'
	endPoll.style.display = 'block'
	changeTab('usersMenu', 'mainTabs')
})

socket.on('endPoll', () => {
	startPollForm.style.display = 'block'
	endPoll.style.display = 'none'
})
