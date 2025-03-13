// Creates student elements for the user list inside the control panel

function buildOption(value, text, selected = false) {
    let option = document.createElement('option')
    option.value = value
    option.selected = selected
    option.textContent = text
    return option
}

// Holds users that are taking a break
const userBreak = []

// Create a student in the user list
function buildStudent(room, studentData) {
    let newStudent
    let cloneDiv = document.getElementById('student-fake')

    if (studentData.classPermissions < currentUser.classPermissions) {
        newStudent = cloneDiv.cloneNode(true)
        newStudent.hidden = false
        newStudent.style.display = 'flex'
        
        newStudent.id = `student-${studentData.username}`
        let summary = newStudent.querySelector('summary')
        let alertSpan = newStudent.querySelector('#alerts')
        let helpReason = newStudent.querySelector('#helpReason')
        let breakReason = newStudent.querySelector('#breakReason')
        let studBox = newStudent.querySelector('input[type="checkbox"]')
        let pollBox = newStudent.querySelector('#response')
        let studTagsSpan = newStudent.querySelector('#studentTags')
        let roomTagDiv = newStudent.querySelector('#roomTags')
        let permDiv = newStudent.querySelector('#permissions')
        let reasonsDiv = newStudent.querySelector('#reasons')
        let extraButtons = newStudent.querySelector('#extraButtons')

        newStudent.querySelector('#username').textContent = studentData.displayName
        studBox.id = 'checkbox_' + studentData.username
        studBox.checked = room.poll.studentBoxes.includes(studentData.username)

        for (let eachResponse in room.poll.responses) {
            if (eachResponse == studentData.pollRes.buttonRes && !room.poll.multiRes) {
                pollBox.style.color = room.poll.responses[eachResponse].color
                pollBox.textContent = eachResponse
            } else if (room.poll.multiRes && studentData.pollRes.buttonRes.includes(eachResponse)) {
                let tempElem = document.createElement('span')
                tempElem.textContent = eachResponse + ' '
                tempElem.style.color = room.poll.responses[eachResponse].color
                pollBox.appendChild(tempElem)
            }
        }

        if (studentData.tags && studentData.tags.includes("Offline")) {
            // Add offline icon
            summary.textContent += `💤`
            newStudent.classList.add('offline')

            // Lower the opacity to indicate offline status
            newStudent.style.opacity = 0.65;
        } else {
            newStudent.style.opacity = 1;
        }

        if (studentData.help) {
            let div = document.createElement('div')
            div.textContent = '❗'
            alertSpan.appendChild(div)
            newStudent.classList.add('help')
            alertSpan.classList.add('help')
            if (studentData.help.reason) {
                helpReason.textContent = studentData.help.reason += ` at ${studentData.help.time.toLocaleTimeString()}`
            }

            let deleteTicketButton = document.createElement('button')
            deleteTicketButton.classList.add('quickButton')
            deleteTicketButton.dataset.studentName = studentData.username
            deleteTicketButton.onclick = (event) => {
                deleteTicket(event.target)
                helpSoundPlayed = false;
            }
            deleteTicketButton.textContent = 'Delete Ticket'

            helpReason.appendChild(deleteTicketButton)

            helpSound()

        }

        if (studentData.break == true) {
            userBreak.push(studentData.username)
        } else if (studentData.break) {
            newStudent.classList.add('break')
            alertSpan.classList.add('break')
            if (studentData.break.reason) {
                breakReason.textContent = studentData.break.reason += ` at ${studentData.break.time.toLocaleTimeString()}`
            }

            let approveBreakButton = document.createElement('button')
            approveBreakButton.classList.add('quickButton')
            approveBreakButton.dataset.studentName = studentData.username
            approveBreakButton.onclick = (event) => {
                approveBreak(true, studentData.username)
                breakSoundPlayed = false;
            }
            approveBreakButton.textContent = 'Approve Break'

            let denyBreakButton = document.createElement('button')
            denyBreakButton.classList.add('quickButton')
            denyBreakButton.dataset.studentName = studentData.username
            denyBreakButton.onclick = (event) => {
                approveBreak(false, studentData.username)
            }
            denyBreakButton.textContent = 'Deny Break'

            breakReason.appendChild(approveBreakButton)
            breakReason.appendChild(denyBreakButton)

            breakSound()
        }

        if (studentData.break) {
            let div = document.createElement('div')
            div.textContent = '⏱'
            alertSpan.appendChild(div)
            newStudent.classList.add('break')
            breakSound()
        }

        if (studentData.break || studentData.help) {
            reasonsDiv.setAttribute('style', 'display: flex;')
        } else {
            reasonsDiv.setAttribute('style', 'display: none;')
        }

        for (let permission of [GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MOD_PERMISSIONS, TEACHER_PERMISSIONS]) {
            let strPerms = ['Guest', 'Student', 'Mod', 'Teacher']
            strPerms = strPerms[permission - 1]
            let permSwitch = document.createElement('button')
            permSwitch.setAttribute("name", "permSwitch");
            permSwitch.setAttribute("class", "permSwitch");
            permSwitch.setAttribute("data-username", studentData.username);
            permSwitch.onclick = (event) => {
                socket.emit('classPermChange', studentData.username, Number(permission))
                permSwitch.classList.add('pressed')
                permSwitch.parentElement.querySelectorAll('.permSwitch').forEach((perm) => {
                    if (perm != permSwitch) {
                        perm.classList.remove('pressed')
                    }
                })
            }
            permSwitch.innerHTML = strPerms
            if (studentData.classPermissions == permission) {
                permSwitch.classList.add('pressed')
            }
            permDiv.appendChild(permSwitch)
        }

        // Add each tag as a button to the tag form
        for (let i = 0; i < room.tagNames.length; i++) {
            let tag = room.tagNames[i]
            if (tag == 'Offline') continue

            let button = document.createElement('button');
            button.innerHTML = tag
            button.name = `button${room.tagNames[i]}`;
            button.value = room.tagNames[i];
            if (studentData.tags == null && studentData.tags == undefined) studentData.tags = ''
                button.onclick = function () {
                    if (!button.classList.contains('pressed')) {
                        button.classList.add('pressed')
                        let span = document.createElement('span');
                        span.textContent = tag;
                        span.setAttribute('id', tag);
                        studTagsSpan.appendChild(span);

                        // Add to current tags
                        if (!currentTags.includes(span.textContent)) {
                            currentTags.push(span.textContent);
                        }
                    } else {
                        button.classList.remove('pressed')
                        const tagSpan = studTagsSpan.querySelector(`#${tag}`);

                        // Remove from current tags
                        const index = currentTags.indexOf(tagSpan.textContent);
                        if (index > -1) {
                            currentTags.splice(index, 1);
                        }
                        tagSpan.remove();
                    }

                    // When someone clicks on a tag, save the tags to the server
                    const tags = []
                    for (let tag of studTagsSpan.children) tags.push(tag.textContent);
                    socket.emit('saveTags', studentData.id, tags, studentData.username)

                    createTagSelectButtons();
                }

                for (ttag of studentData.tags.split(",")) {
                    if (ttag == tag) {
                        button.classList.add('pressed')
                        let span = document.createElement('span');
                        span.textContent = tag;
                        span.setAttribute('id', tag);
                        studTagsSpan.appendChild(span);
                    }
                }

                roomTagDiv.appendChild(button);
            }
        }

        // Ban and Kick buttons
        let banStudentButton = document.createElement('button')
        banStudentButton.className = 'banUser quickButton'
        banStudentButton.setAttribute('data-user', studentData.username)
        banStudentButton.textContent = 'Ban User'
        banStudentButton.onclick = (event) => {
            if (confirm(`Are you sure you want to ban ${studentData.username}?`)) {
                socket.emit('classBanUser', studentData.username)
            }
        }
        extraButtons.appendChild(banStudentButton)
        let kickUserButton = document.createElement('button')
        kickUserButton.className = 'kickUser quickButton'
        kickUserButton.setAttribute('data-userid', studentData.username)
        kickUserButton.onclick = (event) => {
            if (confirm(`Are you sure you want to kick ${studentData.username}?`)) {
                socket.emit('classKickUser', studentData.username)
            }
        }
        kickUserButton.textContent = 'Kick User'
        extraButtons.appendChild(kickUserButton)
    }

    return newStudent
}

// filters and sorts students
function filterSortChange(classroom) {
    if (!classroom.students) return

    let userOrder = Object.keys(classroom.students)

    userOrder = userOrder.filter(username => username != currentUser.username)

    for (let username of userOrder) {
        document.getElementById(`student-${username}`).style.display = ''
    }

    // filter by help
    if (filter.alert) {
        for (let username of userOrder.slice()) {
            let studentElement = document.getElementById(`student-${username}`);
            if (
                (
                    (filter.alert == 1 && !classroom.students[username].help && !classroom.students[username].break) ||
                    (filter.alert == 2 && (classroom.students[username].help || classroom.students[username].break))
                )
            ) {
                studentElement.style.display = 'none'
                userOrder.pop(username)
            }
        }
    }

    // filter by poll
    if (filter.polls) {
        for (let username of userOrder) {
            let studentElement = document.getElementById(`student-${username}`);
            if (
                (filter.polls == 1 && (
                    !classroom.students[username].pollRes.buttonRes && !classroom.students[username].pollRes.textRes)
                ) ||
                (filter.polls == 2 &&
                    (classroom.students[username].pollRes.buttonRes || classroom.students[username].pollRes.textRes)
                )
            ) {
                studentElement.style.display = 'none'
                userOrder.pop(username)
            }
        }
    }

    // sort by name
    if (sort.name == 1) {
        userOrder.students = userOrder.sort()
    } else if (sort.name == 2) {
        userOrder.students = userOrder.sort().reverse()
    }

    // sort by poll name
    if (sort.pollName == 1) {
        userOrder.sort((a, b) => {
            let studentA = classroom.students[a]
            let studentB = classroom.students[b]

            const responses = Object.keys(classroom.poll.responses)

            if (studentA.pollRes.textRes && studentB.pollRes.textRes) {
                return studentA.pollRes.textRes.localeCompare(studentB.pollRes.textRes)
            } else if (studentA.pollRes.textRes) return -1
            else if (studentB.pollRes.textRes) return 1

            if (studentA.pollRes.buttonRes && studentB.pollRes.buttonRes) {
                return responses.indexOf(studentA.pollRes.buttonRes) - responses.indexOf(studentB.pollRes.buttonRes);
            } else if (studentA.pollRes.buttonRes) return -1
            else if (studentB.pollRes.buttonRes) return 1
        })
    } else if (sort.pollName == 2) {
        userOrder.sort((a, b) => {
            let studentA = classroom.students[a]
            let studentB = classroom.students[b]

            const responses = Object.keys(classroom.poll.responses)

            if (studentA.pollRes.textRes && studentB.pollRes.textRes) {
                return studentB.pollRes.textRes.localeCompare(studentA.pollRes.textRes)
            } else if (studentA.pollRes.textRes) return 1
            else if (studentB.pollRes.textRes) return -1

            if (studentA.pollRes.buttonRes && studentB.pollRes.buttonRes) {
                return responses.indexOf(studentB.pollRes.buttonRes) - responses.indexOf(studentA.pollRes.buttonRes);
            } else if (studentA.pollRes.buttonRes) return 1
            else if (studentB.pollRes.buttonRes) return -1
        })
    }

    // sort by poll time
    if (sort.pollTime == 1) {
        userOrder.sort((a, b) => {
            let studentA = classroom.students[a]
            let studentB = classroom.students[b]

            return studentA.pollRes.time - studentB.pollRes.time
        })
    } else if (sort.pollTime == 2) {
        userOrder.sort((a, b) => {
            let studentA = classroom.students[a]
            let studentB = classroom.students[b]

            return studentB.pollRes.time - studentA.pollRes.time
        })
    }

    // sort by help time
    if (sort.helpTime == 1) {
        userOrder.sort((a, b) => {
            let studentA = classroom.students[a]
            let studentB = classroom.students[b]

            if (!studentA.help.time) return 1
            if (!studentB.help.time) return -1

            return studentA.help.time - studentB.help.time
        })
    }

    // sort by permissions
    if (sort.permissions == 1) {
        userOrder.sort((a, b) => classroom.students[b].classPermissions - classroom.students[a].classPermissions)
    } else if (sort.permissions == 2) {
        userOrder.sort((a, b) => classroom.students[a].classPermissions - classroom.students[b].classPermissions)
    }

    // Decide the order that the students should be displayed in
    // If the user is offline, they should be at the bottom of the list
    for (let i = 0; i < userOrder.length; i++) {
        const studentElement = document.getElementById(`student-${userOrder[i]}`);
        studentElement.style.order = studentElement.style.opacity < 1 ? 9999 - i : i;
    }
}

// sets filters
for (let filterElement of document.getElementsByClassName('filter')) {
    filterElement.onclick = (event) => {
        let filterElement = event.target;
        filter[filterElement.id] += 1
        if (filter[filterElement.id] > 2) {
            filter[filterElement.id] = 0
        }

        if (filter[filterElement.id] == 0) {
            filterElement.classList.remove('pressed')
        } else {
            filterElement.classList.add('pressed')
        }

        filterElement.textContent = FilterState[filterElement.id][filter[filterElement.id]]
        socket.emit("setClassSetting", "filter", `${filterElement.id}-${filter[filterElement.id]}`)
        filterSortChange(classroom)
    }
}

// sets sorts
for (let sortElement of document.getElementsByClassName('sort')) {
    sortElement.onclick = (event) => {
        let sortElement = event.target

        for (let sortType of Object.keys(sort)) {
            if (sortType != sortElement.id) {
                sort[sortType] = 0
                let otherSortElements = document.querySelector('.sort#' + sortType)
                if (otherSortElements) {
                    otherSortElements.classList.remove('pressed')
                    otherSortElements.textContent = SortState[sortType][sort[sortType]]
                }
            }
        }

        sort[sortElement.id] += 1
        if (sortElement.id == 'helpTime' && sort[sortElement.id] > 1) {
            sort[sortElement.id] = 0
        } else if (sort[sortElement.id] > 2) {
            sort[sortElement.id] = 0
        }

        if (sort[sortElement.id] == 0) {
            sortElement.classList.remove('pressed')
        } else {
            sortElement.classList.add('pressed')
        }

        sortElement.textContent = SortState[sortElement.id][sort[sortElement.id]]
        socket.emit("setClassSetting", "sort", `${sortElement.id}-${sort[sortElement.id]}`)
        filterSortChange(classroom)
    }
}

function deleteTicket(e) {
    socket.emit('deleteTicket', e.dataset.studentName)
}

function makeLesson() {
    let learningObj = document.getElementById('learningObj')
    let dueAssigns = document.getElementById('dueAssigns')
    socket.emit('lessonStart', learningObj.value)
    alert('Lesson Created')
}

function approveBreak(breakApproval, username) {
    socket.emit('approveBreak', breakApproval, username)
}

let helpSoundPlayed = false;
let breakSoundPlayed = false;

function helpSound() {
    if (!helpSoundPlayed) {
        let helpPing = new Audio('/sfx/help.wav');
        if (mute == false) {
            helpPing.play();
            helpSoundPlayed = true;
        }
    }
}

function breakSound() {
    if (!breakSoundPlayed) {
        let breakPing = new Audio('/sfx/break.wav');
        if (mute == false) {
            breakPing.play();
            breakSoundPlayed = true;
        }
    }
}

function responseSound() {
    let responsePing = new Audio('/sfx/TUTD.wav');

    // plays the sounds
    function playResponseSound() {
        if (mute == false) {
            responsePing.play();
        }
    }

    //creates a mutation observer to watch for changes in the DOM

    const observer = new MutationObserver((mutationsList, observer) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList') {
                playResponseSound()
            }
        }
    })

    //starts the observer and targets the node for configured mutations
    const targetNode = document.body
    const config = { childList: true }
    observer.observe(targetNode, config)
}
