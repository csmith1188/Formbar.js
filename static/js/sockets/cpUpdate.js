let currentTags = []
let students = []

// Ask for classroom update and listen for the response
socket.emit('cpUpdate')
socket.on('cpUpdate', (newClassroom) => {
    currentTags = []
    let studentsOffline = 0
    for (let student of Object.values(newClassroom.students)) {
        if (student.permissions >= 4) continue;
        student.help.time = new Date(student.help.time)
        student.pollRes.time = new Date(student.pollRestime)

        // If the student has no tags, set their tags to an empty string
        let studentTags = student.tags
        if (student.tags == null || student.tags == "") {
            studentTags = ""
        }

        // If the student is offline, add one to the offline counter
        if (studentTags.includes("Offline")) {
            studentsOffline++
        }
        studentTags = studentTags.split(",")

        // For each tag in student tags, if it's not in current tags, then add it
        for (let tag of studentTags) {
            if (!currentTags.includes(tag) && tag != "" && tag != "Offline") {
                currentTags.push(tag)
            }
        }

        if (student.pollRes.buttonRes != null && student.pollRes.buttonRes != "") {
            let tempArr = []
            if (typeof student.pollRes.buttonRes == 'object') {
                tempArr = student.pollRes.buttonRes
            } else {
                tempArr = student.pollRes.buttonRes.split(",")
                for (i in tempArr) {
                    tempArr[i] = tempArr[i].replaceAll('|/comma/|', ',')
                }
            }

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

    totalUsers.innerText = `Users: ${Object.keys(newClassroom.students).length - studentsOffline}`
    if (newClassroom.poll.prompt != "") {
        pollCounter.innerText = `Poll Prompt:'${newClassroom.poll.prompt}'`
    } else {
        pollCounter.innerText = `Poll Prompt:`
    }

    let responseCount = 0;
    let totalResponders = 0;
    for (let [studentName, student] of Object.entries(newClassroom.students)) {
        // If the student is on break, skip them
        if (student.tags && student.tags.includes("Offline")) {
            continue;
        }

        // If the student is on break, a guest, or a teacher, do not include them as a potential responder
        if (!student.break
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

    totalUsers.innerText = `Users: ${Object.keys(newClassroom.students).length - studentsOffline - 1}`

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

    const permissionOptions = [
        {
            name: "Owner",
            permissionLevel: 5
        },
        {
            name: "Teacher",
            permissionLevel: 4
        },
        {
            name: "Mod",
            permissionLevel: 3
        },
        {
            name: "Student",
            permissionLevel: 2
        },
        {
            name: "Guest",
            permissionLevel: 1
        }
    ]

    if (!deepObjectEqual(classroom?.permissions, newClassroom.permissions)) {
        permissionsDiv.innerHTML = ''
        for (let [permission, permissionLevel] of Object.entries(newClassroom.permissions)) {
            let permissionLabel = document.createElement('label')
            permissionLabel.textContent = camelCaseToNormal(permission)

            let permissionSelect = document.createElement('select')
            permissionSelect.className = 'permissionSelect'
            permissionSelect.id = permission
            permissionSelect.onchange = (event) => {
                let select = event.target
                socket.emit('setClassPermissionSetting', select.id, select.options[select.selectedIndex].value)
            }

            for (const permissionOption of permissionOptions) {
                const option = document.createElement('option');
                option.value = permissionOption.permissionLevel;
                option.selected = permissionLevel === permissionOption.permissionLevel;
                option.innerText = permissionOption.name;
                permissionSelect.appendChild(option)
            }

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