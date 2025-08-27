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
        newStudent.id = `student-${studentData.email}`
        newStudent.open = opendetails.indexOf(studentData.email) != -1

        newStudent.addEventListener('click', () => {
            if (newStudent.open) {
                opendetails.splice(opendetails.indexOf(studentData.email), 1)
            } else {
                opendetails.push(studentData.email)
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

        newStudent.querySelector('#email').textContent = studentData.displayName
        studentBox.id = 'checkbox_' + studentData.email
        studentBox.checked = classroom.poll.studentBoxes.indexOf(studentData.email) != -1

        for (let eachResponse in classroom.poll.responses) {
            if (studentData.pollRes.textRes) {
                pollBox.style.color = classroom.poll.responses[eachResponse].color
                pollBox.textContent = studentData.pollRes.textRes
            } else if (eachResponse == studentData.pollRes.buttonRes && !classroom.poll.multiRes) {
                pollBox.style.color = classroom.poll.responses[eachResponse].color
                pollBox.textContent = eachResponse
            } else if (classroom.poll.multiRes && studentData.pollRes.buttonRes.indexOf(eachResponse) != -1) {
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
            div.textContent = '❗'
            alertSpan.appendChild(div)
            newStudent.classList.add('help')
            alertSpan.classList.add('help')
            if (studentData.help.reason) {
                helpReason.textContent = `"${studentData.help.reason}" at ${studentData.help.time.toLocaleTimeString()} `
            }

            let deleteTicketButton = document.createElement('button')
            deleteTicketButton.classList.add('quickButton')
            deleteTicketButton.dataset.studentName = studentData.email
            deleteTicketButton.onclick = (event) => {
                deleteTicket(event.target)
            }
            deleteTicketButton.textContent = 'Delete Ticket'

            helpReason.appendChild(deleteTicketButton)
        }

        if (studentData.break == true) {
            userBreak.push(studentData.email)
        } else if (studentData.break) {
            newStudent.classList.add('break')
            alertSpan.classList.add('break')
            if (studentData.break) {
                breakReason.textContent = `"${studentData.break}"`
            }

            let approveBreakButton = document.createElement('button')
            approveBreakButton.classList.add('quickButton')
            approveBreakButton.dataset.studentName = studentData.email
            approveBreakButton.onclick = (event) => {
                approveBreak(true, studentData.email)
            }
            approveBreakButton.textContent = 'Approve Break'

            let denyBreakButton = document.createElement('button')
            denyBreakButton.classList.add('quickButton')
            denyBreakButton.dataset.studentName = studentData.email
            denyBreakButton.onclick = (event) => {
                approveBreak(false, studentData.email)
            }
            denyBreakButton.textContent = 'Deny Break'

            breakReason.appendChild(approveBreakButton)
            breakReason.appendChild(denyBreakButton)
        }

        if (studentData.break) {
            let div = document.createElement('div')
            div.textContent = '⏱'
            alertSpan.appendChild(div)
            newStudent.classList.add('break')
        }


        for (let permission of [GUEST_PERMISSIONS, STUDENT_PERMISSIONS, MOD_PERMISSIONS, TEACHER_PERMISSIONS]) {
            let strPerms = ['Guest', 'Student', 'Mod', 'Teacher']
            strPerms = strPerms[permission - 1]
            let permSwitch = document.createElement('button')
            permSwitch.setAttribute("name", "permSwitch");
            permSwitch.setAttribute("class", "permSwitch");
            permSwitch.setAttribute("data-email", studentData.email);
            permSwitch.onclick = (event) => {
                socket.emit('classPermChange', studentData.email, Number(permission))
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
        for (let i = 0; i < classroom.tagNames.length; i++) {
            let tag = classroom.tagNames[i]
            if (tag == 'Offline') continue

            let button = document.createElement('button');
            button.innerHTML = tag
            button.name = `button${classroom.tagNames[i]}`;
            button.value = classroom.tagNames[i];
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
                    socket.emit('saveTags', studentData.id, tags, studentData.email);
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

        // Ban and Kick buttons
        let banStudentButton = document.createElement('button')
        banStudentButton.className = 'banUser quickButton'
        banStudentButton.setAttribute('data-user', studentData.email)
        banStudentButton.textContent = 'Ban User'
        banStudentButton.onclick = (event) => {
            if (confirm(`Are you sure you want to ban ${studentData.email}?`)) {
                socket.emit('classBanUser', studentData.email)
            }
        }
        extraButtons.appendChild(banStudentButton)
        let kickUserButton = document.createElement('button')
        kickUserButton.className = 'kickUser quickButton'
        kickUserButton.setAttribute('data-userid', studentData.email)
        kickUserButton.onclick = (event) => {
            if (confirm(`Are you sure you want to kick ${studentData.email}?`)) {
                socket.emit('classKickUser', studentData.email)
            }
        }
        kickUserButton.textContent = 'Kick User'
        extraButtons.appendChild(kickUserButton)

        if (pollBox.textContent == '' && helpReason.textContent == '' && breakReason.textContent == '') {
            reasonsDiv.style.display = 'none'
        }
        return newStudent
    }
}

// filters and sorts students
function filterSortChange(classroom) {
    if (!classroom.students) return

    let userOrder = Object.keys(classroom.students)

    userOrder = userOrder.filter(email => email != currentUser.email)

    for (let email of userOrder) {
        document.getElementById(`student-${email}`).style.display = ''
    }

    // filter by help
    if (filter.alert) {
        for (let email of userOrder.slice()) {
            let studentElement = document.getElementById(`student-${email}`);
            if (
                (
                    (filter.alert == 1 && !classroom.students[email].help && !classroom.students[email].break) ||
                    (filter.alert == 2 && (classroom.students[email].help || classroom.students[email].break))
                )
            ) {
                studentElement.style.display = 'none'
                userOrder.pop(email)
            }
        }
    }

    // filter by poll
    if (filter.polls) {
        for (let email of userOrder) {
            let studentElement = document.getElementById(`student-${email}`);
            if (
                (filter.polls == 1 && (
                        !classroom.students[email].pollRes.buttonRes && !classroom.students[email].pollRes.textRes)
                ) ||
                (filter.polls == 2 &&
                    (classroom.students[email].pollRes.buttonRes || classroom.students[email].pollRes.textRes)
                )
            ) {
                studentElement.style.display = 'none'
                userOrder.pop(email)
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

function approveBreak(breakApproval, email) {
    socket.emit('approveBreak', breakApproval, email)
}