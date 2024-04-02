socket.emit('cpUpdate')
socket.on('cpUpdate', (newClassroom) => {
	for (let student of Object.values(newClassroom.students)) {
		student.help.time = new Date(student.help.time)
	}

	classCode.textContent = 'Class Code: ' + newClassroom.key
	buildPreviousPolls(newClassroom.pollHistory)

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

	const responsesCounter = document.getElementById('responsesCounter');
	responsesCounter.innerText = `Total Responses: ${responseCount} out of ${Object.keys(newClassroom.students).length - 1}`;

	for (const username of Object.keys(newClassroom.students)) {
		let studentElement = document.getElementById(`student-${username}`)
		let oldStudentData = null
		let newStudentData = newClassroom.students[username]

		if (classroom.students && classroom.students[username])
			oldStudentData = classroom.students[username]

		if (!studentElement) {
			let builtstudent = buildStudent(newClassroom, newStudentData)
			if (builtstudent) usersDiv.appendChild(builtstudent)
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

	filterSortChange(newClassroom)

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

	classroom = newClassroom
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

//socket.emit("classPollEmit");
socket.on("classPollSave", (classPollData) => {
	console.log(classPollData);
	let classCodeText = classCode.textContent.split(": ")
	socket.emit("sharePollToClass", classPollData.id, classCodeText[1]);
})

var selectTags = document.createElement('dialog')
let closeTags = document.createElement('button');
let selectTagForm = document.createElement('form');
selectTagForm.setAttribute('name', 'selectTagForm');
tagNames = tagNames.split(",");
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