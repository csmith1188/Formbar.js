let currentTags = []
let students = []
let classId = null
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

// Ask for classroom update and listen for the response
socket.on('classUpdate', (classroomData) => {
    if (!classroomData.students) {
        return;
    }

    classId = classroomData.id
    currentTags = []
    let studentsOffline = 0
    for (const studentId of Object.keys(classroomData.students)) {
        let student = classroomData.students[studentId]

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
                if (students[i].id == student.id) {
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

    className.innerHTML = `<b>Class Name:</b> ${classroomData.className}`
    classCode.innerHTML = `<b>Class Code:</b> ${classroomData.key}`

    // Set the users to the number of students minus the number of offline students and minus one for the teacher
    totalUsers.innerHTML = `<b>Users:</b> ${Object.keys(classroomData.students).length - studentsOffline - 1}`
    if (classroomData.poll.prompt != "") {
        pollCounter.innerText = `Poll Prompt: '${classroomData.poll.prompt}'`
    } else {
        pollCounter.innerText = `Poll Prompt:`
    }

    const responseCount = classroomData.poll?.totalResponses ?? 0;
    const totalResponders = classroomData.poll?.totalResponders ?? 0;
    responsesCounter.innerText = `Total Responses: ${responseCount} out of ${totalResponders}`;

    const studentIds = Object.keys(classroomData.students);
    validateStudents(studentIds);
    for (const userId of studentIds) {
        let studentElement = document.getElementById(`student-${userId}`)
        let oldStudentData = null
        let newStudentData = classroomData.students[userId]

        // Add any selected tags to the current tags list
        // This will allow the teacher to filter students by tags
        if (newStudentData.tags) {
            for (const tag of newStudentData.tags.split(',')) {
                if (!currentTags.includes(tag) && tag !== "" && tag !== "Offline") {
                    currentTags.push(tag)
                }
            }
        }

        if (classroom.students && classroom.students[userId]) oldStudentData = classroom.students[userId]
        if (!studentElement) {
            let builtStudent = buildStudent(classroomData, newStudentData)
            if (builtStudent) usersDiv.appendChild(builtStudent)
            continue
        }

        if (deepObjectEqual(oldStudentData, newStudentData)) continue

        studentElement.replaceWith(buildStudent(classroomData, newStudentData))
    }

    totalUsers.innerHTML = `<b>Users:</b> ${Object.keys(classroomData.students).length - studentsOffline - 1}`

    for (let studentElement of document.getElementsByClassName('student')) {
        if (!classroomData.students[studentElement.id.replace('student-', '')]) {
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

    if (currentUser.classPermissions >= classroomData.permissions.controlPolls) {
        pollsTabButton.style.display = ''
    } else {
        pollsTabButton.style.display = 'none'

        if (pollsTabButton.classList.contains('pressed')) {
            changeTab('usersMenu', 'mainTabs')
        }
    }

    if (currentUser.classPermissions >= classroomData.permissions.manageClass) {
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

    if (classroom?.poll?.status != classroomData.poll.status) {
        if (classroomData.poll.status) {
            endPoll.style.display = 'block'
        } else {
            endPoll.style.display = 'none'
        }
    }

    if (!deepObjectEqual(classroom?.permissions, classroomData.permissions)) {
        permissionsDiv.innerHTML = ''
        for (let [permission, permissionLevel] of Object.entries(classroomData.permissions)) {
            let permissionLabel = document.createElement('label')
            permissionLabel.className = 'permissionLabel revampDiv'
            permissionLabel.textContent = camelCaseToNormal(permission)

            let permissionSelect = document.createElement('select')
            permissionSelect.className = 'permissionSelect revampButton'
            permissionSelect.id = permission
            permissionSelect.onchange = (event) => {
                let select = event.target
                socket.emit('setClassPermissionSetting', select.id, select.options[select.selectedIndex].value)
            }

            for (const permissionOption of permissionOptions) {
                const option = document.createElement('option');
                option.value = permissionOption.permissionLevel;
                option.selected = permissionLevel == permissionOption.permissionLevel;
                option.innerText = permissionOption.name;
                permissionSelect.appendChild(option)
            }

            permissionLabel.appendChild(permissionSelect)
            permissionsDiv.appendChild(permissionLabel)
        }
    }

    if (!deepObjectEqual(classroom?.tags, classroomData.tags)) {
        for (let tag of classroomData.tags) {
            addTagElement(tag)
        }

        let newTagDiv = document.createElement('div')
        let newTag = document.createElement('textarea')
        newTag.className = 'revampButton revampWithText'
        newTag.type = 'text'
        newTag.placeholder = 'Add Tag (tag1, tag2, ...)'
        newTag.style.height = "5.5vh"

        let addTagButton = document.createElement('button')
        addTagButton.className = 'circularButton'
        addTagButton.innerHTML = '<img src="/img/checkmark-outline.svg">'
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

        // After rebuilding tag options, refresh student tag buttons
        if (typeof updateStudentTags === 'function') {
            updateStudentTags();
        }
    }

    filterSortChange(classroomData)

    classroom = classroomData
})