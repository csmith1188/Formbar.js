socket.emit('cpUpdate')
let currentTags = []
let students = []
socket.on('cpUpdate', (newClassroom) => {
	currentTags = []
	for (let student of Object.values(newClassroom.students)) {
		student.help.time = new Date(student.help.time)
		student.pollRes.time = new Date(student.pollRes.time)
		let studentTags = student.tags
		if (student.tags == null || student.tags == "") {
			studentTags = ""
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

	classCode.textContent = `Class Code: ${newClassroom.key}`
	classId.textContent = `Class ID: ${newClassroom.id}`

	document.getElementById('nextStep').onclick = () => {
		doStep(classroom.currentStep)
	}

	totalUsers.innerText = `Total Users: ${Object.keys(newClassroom.students).length - 1}`
	if (newClassroom.poll.prompt != "") {
		pollCounter.innerText = `Poll Prompt:'${newClassroom.poll.prompt}'`
	} else {
		pollCounter.innerText = `Poll Prompt:`
	}

	let responseCount = 0;
	for (let [key, value] of Object.entries(newClassroom.students)) {
		if (value.pollRes.buttonRes != "" || value.pollRes.textRes != "") {
			responseCount++;
		}
	}

	responsesCounter.innerText = `Total Responses: ${responseCount} out of ${newClassroom.poll.allowedResponses.length}`;

	for (const username of Object.keys(newClassroom.students)) {
		let studentElement = document.getElementById(`student-${username}`)
		let oldStudentData = null
		let newStudentData = newClassroom.students[username]

		if (classroom.students && classroom.students[username])
			oldStudentData = classroom.students[username]

		if (!studentElement) {
			let builtStudent = buildStudent(newClassroom, newStudentData)
			if (builtStudent) usersDiv.appendChild(builtStudent)
			continue
		}

		if (deepObjectEqual(oldStudentData, newStudentData)) {
			continue
		}

		studentElement.replaceWith(buildStudent(newClassroom, newStudentData))
	}

	totalUsers.innerText = `Total Users: ${Object.keys(newClassroom.students).length - 1}`

	for (let studentElement of document.getElementsByClassName('student')) {
		if (!newClassroom.students[studentElement.id.replace('student-', '')]) {
			studentElement.remove()
		}
	}

	if (currentUser.classPermissions >= newClassroom.permissions.manageStudents) {
		bannedTabButton.style.display = ''
	} else {
		bannedTabButton.style.display = 'none'

		if (bannedTabButton.classList.contains('pressed')) {
			changeTab('usersMenu', 'mainTabs')
		}
	}

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

	filterSortChange(newClassroom)

	classroom = newClassroom

	socket.emit('customPollUpdate')
})

socket.emit('pluginUpdate')
socket.on('pluginUpdate', (plugins) => {
	pluginsDiv.innerHTML = ''
	for (let plugin of plugins) {
		let pluginDiv = document.createElement('div')
		pluginDiv.id = plugin.id
		pluginDiv.className = 'plugin'
		let pluginName = document.createElement('input')
		pluginName.type = 'text'
		pluginName.value = plugin.name
		pluginName.placeholder = 'Name'
		pluginName.onchange = (event) => {
			socket.emit(
				'changePlugin',
				event.target.parentElement.id,
				event.target.value,
				null
			)
		}
		pluginDiv.appendChild(pluginName)
		let pluginURL = document.createElement('input')
		pluginURL.type = 'url'
		pluginURL.value = plugin.url
		pluginURL.placeholder = 'URL'
		pluginURL.onchange = (event) => {
			let pluginURL = event.target

			if (!event.target.checkValidity()) {
				event.target.reportValidity()
				return
			}

			socket.emit(
				'changePlugin',
				pluginURL.parentElement.id,
				null,
				pluginURL.value
			)
		}
		pluginDiv.appendChild(pluginURL)
		let removePlugin = document.createElement('button')
		removePlugin.className = 'quickButton'
		removePlugin.textContent = 'Remove Plugin'
		removePlugin.onclick = (event) => {
			socket.emit(
				'removePlugin',
				event.target.parentElement.id
			)
		}
		pluginDiv.appendChild(removePlugin)
		pluginsDiv.appendChild(pluginDiv)
	}

	let addPluginForm = document.createElement('div')
	addPluginForm.id = 'addPluginForm'
	let newPluginName = document.createElement('input')
	newPluginName.id = 'newPluginName'
	newPluginName.type = 'text'
	newPluginName.placeholder = 'Name'
	addPluginForm.append(newPluginName)
	let newPluginURL = document.createElement('input')
	newPluginURL.id = 'newPluginURL'
	newPluginURL.type = 'url'
	newPluginURL.placeholder = 'URL'
	addPluginForm.append(newPluginURL)
	let submitPlugin = document.createElement('button')
	submitPlugin.className = 'quickButton'
	submitPlugin.textContent = 'Add Plug-in'
	submitPlugin.onclick = () => {
		let newPluginName = document.getElementById('newPluginName')
		let newPluginURL = document.getElementById('newPluginURL')

		if (!newPluginURL.checkValidity()) {
			newPluginURL.reportValidity()
			return
		}

		socket.emit('addPlugin', newPluginName.value, newPluginURL.value)
	}
	addPluginForm.append(submitPlugin)
	if (!pluginsMenu.querySelector('#addPluginForm')) {
		pluginsMenu.append(addPluginForm)
	} else {
		return;
	};
})

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
	let selectPollDiv = document.querySelector('div#selectPoll')

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
	};
	selectPollDiv.innerHTML = ''
	
	// Creation of switchAll button
	let switchAll = document.createElement('button')
	switchAll.className = 'switchAll'
	switchAll.textContent = 'Switch All'

	let switchState = document.querySelector(`input[name="studentCheckbox"]`).checked
	switchAll.onclick = () => {
		switchState = !switchState
		for (let elem of document.querySelectorAll(`button[class="pressed"]`)) {
			elem.click()
		}

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

		let studElem = document.querySelector(`details[id="student-${student.username}"]`)
		let studCheck = document.querySelector(`input[id="checkbox_${student.username}"]`)

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
			for (let tag of document.getElementsByClassName('pressed')) {
				if (tempTags.includes(tag.name) || tag.name == "") {
					continue
				}
				tempTags.push(tag.name);
			}
			tempTags = tempTags.sort().join();

			// If the student has any of the selected tags, check the checkbox and open their menu
			for (let student of students) {
				if (student.permissions >= TEACHER_PERMISSIONS) continue
				// Combines the students tags and their poll responses
				let tempStudTags = []
				if (student.tags == null) {
					continue
				}
				for (let tag of student.tags.split(",")) {
					if (tag == "") {
						continue
					}
					tempStudTags.push(tag)
				}
				for (let tag of student.pollRes.buttonRes.split(",")) {
					if (tag == "" || tag == "remove") {
						continue
					}
					tempStudTags.push(tag)
				}
				tempStudTags = tempStudTags.sort().join();

				studentElement = document.getElementById(`student-${student.username}`)
				let checkbox = studentElement.querySelector('input[type="checkbox"]')

				if (!student.break && (tempStudTags == tempTags || tempTags == "")) {
					studentElement.open = true
					if (!checkbox.checked) checkbox.click()
				} else {
					studentElement.open = false
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
