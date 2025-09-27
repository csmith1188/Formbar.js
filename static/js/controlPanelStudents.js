// Creates student elements for the user list inside the control panel

// Holds users that are taking a break
const userBreak = []

// Stores the currently opened student elements
let opendetails = []

// Checks if all the student boxes are of students currently in the classroom
function validateStudents(students) {
    for (const student of usersDiv.children) {
        if (!student.id) continue;

        if (!students.includes(student.id.replace('student-', '')) && student.id !== 'student-fake') {
            student.remove()
        }
    }
}

// Create a student in the user list
function buildStudent(classroom, studentData) {
    const studentTemplateDiv = document.getElementById('student-fake')

    if (studentData.classPermissions < currentUser.classPermissions) {
        const newStudent = studentTemplateDiv.cloneNode(true)
        newStudent.hidden = false
        newStudent.style.display = 'flex'
        newStudent.id = `student-${studentData.id}`
        newStudent.open = opendetails.indexOf(studentData.id) != -1

        newStudent.addEventListener('click', () => {
            if (newStudent.open) {
                opendetails.splice(opendetails.indexOf(studentData.id), 1)
            } else {
                opendetails.push(studentData.id)
            }
        })

        let summary = newStudent.querySelector('summary')
        let alertSpan = newStudent.querySelector('#alerts')
        let helpReason = newStudent.querySelector('#helpReason')
        let breakReason = newStudent.querySelector('#breakReason')
        let studentBox = newStudent.querySelector('input[type="checkbox"]')
        let pollBox = newStudent.querySelector('#response')
        let studTagsSpan = newStudent.querySelector('#studentTags')
        let roomTagDiv = newStudent.querySelector('#roomTags')
        let permDiv = newStudent.querySelector('#permissions')
        let reasonsDiv = newStudent.querySelector('#reasons')
        let extraButtons = newStudent.querySelector('#extraButtons')
        let digipogButtons = newStudent.querySelector('#digipogButtons')

        newStudent.querySelector('#email').textContent = studentData.displayName
        studentBox.id = 'checkbox_' + studentData.id
        studentBox.checked = classroom.poll.studentsAllowedToVote.includes(studentData.id.toString())

        for (let eachResponse in classroom.poll.responses) {
            if (studentData.pollRes.allowTextResponses) {
                pollBox.style.color = classroom.poll.responses[eachResponse].color
                pollBox.textContent = studentData.pollRes.textRes
            } else if (eachResponse == studentData.pollRes.buttonRes && !classroom.poll.allowMultipleResponses) {
                pollBox.style.color = classroom.poll.responses[eachResponse].color
                pollBox.textContent = eachResponse
            } else if (classroom.poll.allowMultipleResponses && studentData.pollRes.buttonRes.indexOf(eachResponse) != -1) {
                let tempElem = document.createElement('span')
                tempElem.textContent = eachResponse + ' '
                tempElem.style.color = classroom.poll.responses[eachResponse].color
                pollBox.appendChild(tempElem)
            }
        }

        if (studentData.tags && studentData.tags.indexOf('Offline') != -1) {
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
            //summary.innerHTML += '❗'
            alertSpan.appendChild(div)
            newStudent.classList.add('help')
            alertSpan.classList.add('help')

            let deleteTicketButton = document.createElement('button')
            deleteTicketButton.classList.add('quickButton', 'revampButton', 'noReason')
            deleteTicketButton.dataset.studentName = studentData.id
            deleteTicketButton.onclick = (event) => {
               deleteTicket(event.target)
            }
            deleteTicketButton.textContent = 'Delete Ticket'

            if (studentData.help.reason) {
                helpReason.textContent = `"${studentData.help.reason}" at ${studentData.help.time.toLocaleTimeString()}`;
                deleteTicketButton.classList.remove('noReason')
            }

            helpReason.appendChild(deleteTicketButton)
        }

        if (studentData.break == true) {
            userBreak.push(studentData.id)
        } else if (studentData.break) {
            newStudent.classList.add('break')
            alertSpan.classList.add('break')
            if (studentData.break) {
                breakReason.textContent = `"${studentData.break}"`
            }

            let approveBreakButton = document.createElement('button')
            approveBreakButton.classList.add('quickButton', 'revampButton')
            approveBreakButton.dataset.studentName = studentData.id
            approveBreakButton.onclick = (event) => {
                approveBreak(true, studentData.id)
            }
            approveBreakButton.textContent = 'Approve Break'

            let denyBreakButton = document.createElement('button')
            denyBreakButton.classList.add('quickButton', 'revampButton')
            denyBreakButton.dataset.studentName = studentData.id
            denyBreakButton.onclick = (event) => {
                approveBreak(false, studentData.id)
            }
            denyBreakButton.textContent = 'Deny Break'

            breakReason.appendChild(approveBreakButton)
            breakReason.appendChild(denyBreakButton)
        }

        if (studentData.break) {
            let div = document.createElement('div')
            div.textContent = '⏱'
            alertSpan.appendChild(div)

            let endBreakButton = document.createElement('button')
            endBreakButton.classList.add('quickButton', 'revampButton')
            endBreakButton.dataset.studentName = studentData.id
            endBreakButton.onclick = (event) => {
                approveBreak(false, studentData.id)
            }
            endBreakButton.textContent = 'End Break'

            breakReason.appendChild(endBreakButton)

            newStudent.classList.add('break')
        }

        if(studentData.pollRes.textRes !== '' && studentData.pollRes.buttonRes !== '') {
            let div = document.createElement('div')
            div.style = 'width:24px;height:24px;filter:invert(1);'
            div.innerHTML = '<img src="/img/text-outline.svg">'
            alertSpan.appendChild(div)
            newStudent.title = studentData.pollRes.textRes;
        } else {
            newStudent.title = '';
        }

        let permSwitch = document.createElement('select');
        permSwitch.setAttribute("name", "permSwitch");
        permSwitch.setAttribute("class", "permSwitch revampButton");
        permSwitch.setAttribute("data-id", studentData.id);


        for (let permission of [GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MOD_PERMISSIONS, TEACHER_PERMISSIONS]) {
            let strPerms = ['Guest', 'Student', 'Mod', 'Teacher']
            strPerms = strPerms[permission - 1]
            // }

            permSwitch.onchange = (event) => {
                const newPerm = Number(event.target.value);
                socket.emit('classPermChange', studentData.id, newPerm)
            }
            
            const option = document.createElement('option');
            option.value = permission;
            option.innerText = strPerms;
            permSwitch.appendChild(option)

            if (studentData.classPermissions == permission) {
                permSwitch.value = permission;
            }

            permDiv.appendChild(permSwitch)
        }

        // Add each tag as a button to the tag form
        for (let i = 0; i < classroom.tags.length; i++) {
            let tag = classroom.tags[i]
            if (tag == 'Offline') continue

            let button = document.createElement('button');
            button.innerHTML = tag
            button.name = `button${classroom.tags[i]}`;
            button.value = classroom.tags[i];
            if (studentData.tags == null && studentData.tags == undefined) studentData.tags = ''
            button.onclick = function () {
                if (!button.classList.contains('pressed')) {
                    button.classList.add('pressed')
                    let span = document.createElement('span');
                    span.textContent = tag;
                    span.setAttribute('id', tag);
                    studTagsSpan.appendChild(span);

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
                if (roomTagDiv) {
                    for (let tagButton of roomTagDiv.querySelectorAll('button.pressed')) {
                        tags.push(tagButton.textContent);
                    }
                    socket.emit('saveTags', studentData.id, tags);
                }

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

        // Digipog awarding
        let digipogAwardInput = document.createElement('input');
        digipogAwardInput.className = 'quickButton revampButton revampWithText digipogAward'
        digipogAwardInput.placeholder = '0'
        digipogAwardInput.type = 'number'
        digipogAwardInput.min = 0
        digipogAwardInput.value = ''
        digipogAwardInput.max = 999;
        digipogAwardInput.oninput = (event) => {
            if (digipogAwardInput.value > 999) digipogAwardInput.value = 999
            if (digipogAwardInput.value < 0) digipogAwardInput.value = 0
            if (digipogAwardInput.value == '') digipogAwardInput.value = 0
            digipogAwardInput.value = parseInt(digipogAwardInput.value)
        }
        digipogButtons.appendChild(digipogAwardInput)

        let sendDigipogs = document.createElement('button')
        sendDigipogs.className = 'quickButton revampButton acceptButton digipogSend'
        sendDigipogs.setAttribute('data-user', studentData.id)
        sendDigipogs.textContent = 'Award Digipogs'
        sendDigipogs.onclick = (event) => {
            awardDigipogs(studentData.id, digipogAwardInput.value)
        }
        digipogButtons.appendChild(sendDigipogs)

        // Ban and Kick buttons
        let banStudentButton = document.createElement('button')
        banStudentButton.className = 'banUser quickButton revampButton warningButton'
        banStudentButton.setAttribute('data-user', studentData.id)
        banStudentButton.textContent = 'Ban User'
        banStudentButton.onclick = (event) => {
            if (confirm(`Are you sure you want to ban ${studentData.displayName}?`)) {
                socket.emit('classBanUser', studentData.id)
            }
        }
        extraButtons.appendChild(banStudentButton)
        let kickUserButton = document.createElement('button')
        kickUserButton.className = 'kickUser quickButton revampButton warningButton'
        kickUserButton.setAttribute('data-userid', studentData.id)
        kickUserButton.onclick = (event) => {
            if (confirm(`Are you sure you want to kick ${studentData.displayName}?`)) {
                socket.emit('classKickUser', studentData.id)
            }
        }
        kickUserButton.textContent = 'Kick User'
        extraButtons.appendChild(kickUserButton)

        if (helpReason.textContent == '' && breakReason.textContent == '') {
            reasonsDiv.style.display = 'none'
        }
        return newStudent
    }
}

// filters and sorts students
function filterSortChange(classroom) {
    if (!classroom.students) return
    let userOrder = Object.keys(classroom.students)

    userOrder = userOrder.filter(userId => userId != currentUser.id)
    for (const userId of userOrder) {
        document.getElementById(`student-${userId}`).style.display = ''
    }

    // filter by help
    if (filter.alert) {
        for (const userId of userOrder.slice()) {
            let studentElement = document.getElementById(`student-${userId}`);
            if (
                (
                    (filter.alert == 1 && !classroom.students[userId].help && !classroom.students[userId].break) ||
                    (filter.alert == 2 && (classroom.students[userId].help || classroom.students[userId].break))
                )
            ) {
                studentElement.style.display = 'none'
                userOrder.pop(userId)
            }
        }
    }

    // filter by poll
    if (filter.polls) {
        for (const userId of userOrder) {
            let studentElement = document.getElementById(`student-${userId}`);
            if (
                (filter.polls == 1 && (
                        !classroom.students[userId].pollRes.buttonRes && !classroom.students[userId].pollRes.textRes)
                ) ||
                (filter.polls == 2 &&
                    (classroom.students[userId].pollRes.buttonRes || classroom.students[userId].pollRes.textRes)
                )
            ) {
                studentElement.style.display = 'none'
                userOrder.pop(userId)
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

        // Update the filter settings in the database
        socket.emit("setClassSetting", "filter", JSON.stringify({
            alert: filter["alert"],
            polls: filter["polls"]
        }))
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

function approveBreak(breakApproval, userId) {
    socket.emit('approveBreak', breakApproval, userId)
}

function awardDigipogs(userId, amount) {
    if (amount <= 0 || isNaN(amount)) return

    socket.emit('awardDigipogs', 
        { from: currentUser.id, to: userId, amount: Number(amount) }
    )
    const awardButton = document.querySelector(`button.digipogSend[data-user="${userId}"]`)
    const awardInput = awardButton.parentElement.querySelector('input.digipogAward');
    awardInput.value = 0;
}