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
        if(student.help.time) student.help.time = new Date(student.help.time)
        if(student.pollRes.time) student.pollRes.time  = new Date(student.pollRes.time)

        // If the student has no tags, set their tags to an empty string
        let studentTags = student.tags
        if (!Array.isArray(studentTags) || studentTags === null) {
            studentTags = []
        }

        // If the student is offline, add one to the offline counter
        if (studentTags.includes("Offline")) {
            studentsOffline++
        }

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

    let pollCounter = document.getElementById('pollCounter');

    // Set the users to the number of students minus the number of offline students and minus one for the teacher
    totalUsers.innerHTML = `<b>Users:</b> ${Object.keys(classroomData.students).length - studentsOffline - 1}`
    if (classroomData.poll.prompt != "") {
        pollCounter.innerText = `Poll Prompt: '${classroomData.poll.prompt}'`
    } else {
        pollCounter.innerText = `No Poll Prompt`
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
        if (Array.isArray(newStudentData.tags)) {
            for (const tag of newStudentData.tags) {
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

    let newTag = document.getElementById('tagInput');
    newTag.value = '';

    let tagButton = document.getElementById('addTagButton');

    tagButton.onclick = () => {
        if (newTag.value.includes(',')) {
            let tags = newTag.value.split(',')

            for (let tag of tags) {
                if (tag.trim() == '') continue
                const clean = tag.trim();
                if (!Array.isArray(classroom.tags)) classroom.tags = [];
                if (!classroom.tags.includes(clean)) classroom.tags.push(clean)
                addTagElement(clean);
            }
        } else {
            const clean = newTag.value.trim();
            if (clean !== '') {
                if (!Array.isArray(classroom.tags)) classroom.tags = [];
                if (!classroom.tags.includes(clean)) classroom.tags.push(clean)
                addTagElement(clean);
            }
        }
        newTag.value = ''

        sendTags(classroom.tags)
        updateStudentTags()
        createTagSelectButtons();
        if (typeof rebuildSelectTagForm === 'function') rebuildSelectTagForm();
    }

    const previousTags = Array.isArray(classroom?.tags) ? classroom.tags : [];
    const incomingTags = Array.isArray(classroomData.tags) ? classroomData.tags : null;
    const renderTags = (list) => {
        let tagsDiv = document.querySelector('#tagsList');
        tagsDiv.innerHTML = '';
        for (let tag of list) {
            addTagElement(tag);
        }
        if (typeof updateStudentTags === 'function') updateStudentTags();
        if (typeof rebuildSelectTagForm === 'function') rebuildSelectTagForm();
    };

    // Ensure global classroom reflects latest data before rebuilding tag-dependent UI
    classroom = classroomData;

    if (incomingTags) {
        if (!deepObjectEqual(previousTags, incomingTags)) {
            renderTags(incomingTags);
        }
    } else {
        // Fallback: fetch tags via REST if not included in socket payload
        fetch('/api/room/tags')
            .then(r => r.ok ? r.json() : { tags: [] })
            .then(data => {
                const tags = Array.isArray(data.tags) ? data.tags : [];
                if (!deepObjectEqual(previousTags, tags)) {
                    renderTags(tags);
                }
            })
            .catch(() => {});
    }

    filterSortChange(classroomData)

    classroom = classroomData
})
