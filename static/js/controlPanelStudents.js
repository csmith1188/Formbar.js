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
        if(studentData.id.toString().includes('guest')) newStudent.classList.add('guestStudent')
        newStudent.open = opendetails.indexOf(studentData.id) != -1

        newStudent.onclick = (e) => {
            if(e.target.id == 'alerts') e.preventDefault();
        }

        newStudent.addEventListener('toggle', () => {
            if (newStudent.open) {
                if(opendetails.indexOf(studentData.id) == -1) opendetails.push(studentData.id)
            } else {
                opendetails.splice(opendetails.indexOf(studentData.id), 1)
            }
        })

        let summary = newStudent.querySelector('summary')
        let alertSpan = newStudent.querySelector('#alerts')
        let reasons = newStudent.querySelector('#reasons')
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
        studentBox.onclick = () => {
            const canStudentVote = studentBox.checked;
            let studentsAllowedToVote = classroom.poll.studentsAllowedToVote;
            if (studentBox.checked && !studentsAllowedToVote.includes(studentData.id.toString())) {
                studentsAllowedToVote.push(studentData.id.toString());
            }

            socket.emit('changeCanVote', { [studentData.id]: canStudentVote });
        }

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
            div.innerHTML += '❗'
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

        alertSpan.onclick = () => {
            reasons.classList.toggle('open');
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
        if (!Array.isArray(classroom.tags)) classroom.tags = [];
        //roomTagDiv.innerHTML = '';
        for (let i = 0; i < classroom.tags.length; i++) {
            let tag = classroom.tags[i]
            if (tag == 'Offline') continue

            let button = document.createElement('button');
            button.innerHTML = tag
            button.classList.add('revampButton')
            button.name = `button${classroom.tags[i]}`;
            button.value = classroom.tags[i];
            if (!Array.isArray(studentData.tags)) studentData.tags = []
            button.onclick = function () {
                if (!button.classList.contains('pressed')) {
                    button.classList.add('pressed')
                    let span = document.createElement('span');
                    span.textContent = tag;
                    span.setAttribute('id', tag);
                    studTagsSpan.appendChild(span);

                    // If the studentData does not have tags, add the tag
                    if (!studentData.tags.includes(tag)) {
                        studentData.tags.push(tag);
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
                    studentData.tags = studentData.tags.filter(t => t !== tag);

                    if (studTagsSpan) {
                        const tagSpan = studTagsSpan.querySelector(`#${tag}`);
                        if (tagSpan) tagSpan.remove();
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

            // Set pressed state for tags already present
            if (Array.isArray(studentData.tags) && studentData.tags.includes(tag)) {
                button.classList.add('pressed')
                let span = document.createElement('span');
                span.textContent = tag;
                span.setAttribute('id', tag);
                studTagsSpan.appendChild(span);
            }

            roomTagDiv.appendChild(button);
        }

        // Digipog awarding
        // If the user is not a guest, allow awarding digipogs
        if (studentData.permissions !== GUEST_PERMISSIONS) {
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
        } else {
            digipogButtons.style.display = 'none'
        }

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

// If there are filters provided, parse them and set the correct filters
// This is to preserve filters between page loads
if (settings.filter) {
    filterSortChange(classroom);
    filter = settings.filter;

    for (let filterType of Object.keys(filter)) {
        if (filter[filterType] != 0) {
            let filterElement = document.querySelector('.filter#' + filterType);
            if (filterElement) {
                filterElement.classList.add('pressed')
                filterElement.innerHTML = FilterState[filterElement.id] + `<img src="/img/checkmark-outline.svg" alt=${FilterState[filterElement.id]}>`
            }
        }
    }
}

// Handle sorting and filtering
// They're stored by their name then a hyphen before the sorting value it is
// 0 = off, 1 = descending, 2 = ascending
if (settings.sort) {
    filterSortChange(classroom);
    sort = settings.sort;
    
    for (let sortType of Object.keys(sort)) {
        if (sort[sortType] != 0) {
            let sortElement = document.querySelector('.sort#' + sortType);
            if (sortElement) {
                sortElement.classList.add('pressed')
                let sortIcon = sortElement.querySelector('div').getElementsByClassName('currentSortIcon')[0];

                switch(sort[sortType]) {
                    case 0:
                        sortIcon.src = '/img/swap-vertical-up.svg';
                        sortIcon.style.opacity = 0;
                        break;
                    case 1:
                        sortIcon.src = '/img/swap-vertical-down.svg';
                        sortIcon.style.opacity = 1;
                        break;
                    case 2:
                        sortIcon.src = '/img/swap-vertical-up.svg';
                        sortIcon.style.opacity = 1;
                        break;
                }
            }
        }
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

    // Filter by user attributes
    if (filter.answeredPoll) {
        for (const userId of userOrder.slice()) {
            let studentElement = document.getElementById(`student-${userId}`);
            if (
                (filter.answeredPoll == 1 && (
                        classroom.students[userId].pollRes.buttonRes == '' && classroom.students[userId].pollRes.textRes == '')
                )
            ) {
                studentElement.style.display = 'none'
                const index = userOrder.indexOf(userId);
                if (index > -1) {
                    userOrder.splice(index, 1);
                }
            }
        }
    }

    if (filter.alert) {
        for (const userId of userOrder.slice()) {
            let studentElement = document.getElementById(`student-${userId}`);
            if (
                (
                    (filter.alert == 1 && (!classroom.students[userId].help && !classroom.students[userId].break))
                )
            ) {
                studentElement.style.display = 'none'
                const index = userOrder.indexOf(userId);
                if (index > -1) {
                    userOrder.splice(index, 1);
                }
            }
        }
    }

    if (filter.canVote) {
        for (const userId of userOrder.slice()) {
            let studentElement = document.getElementById(`student-${userId}`);
            let studentCheckbox = studentElement.querySelector(`#checkbox_${userId}`);
            if (!studentCheckbox || !studentCheckbox.checked) {
                studentElement.style.display = 'none'
                const index = userOrder.indexOf(userId);
                if (index > -1) {
                    userOrder.splice(index, 1);
                }
            }
        }
    }

    if (filter.cantVote) {
        for (const userId of userOrder.slice()) {
            let studentElement = document.getElementById(`student-${userId}`);
            let studentCheckbox = studentElement.querySelector(`#checkbox_${userId}`);
            if (studentCheckbox || studentCheckbox.checked) {
                studentElement.style.display = 'none'
                const index = userOrder.indexOf(userId);
                if (index > -1) {
                    userOrder.splice(index, 1);
                }
            }
        }
    }

    // sort by response order
    if (sort.responseOrder == 1) {
        let responsesIndexes = Object.keys(classroom.poll.responses);
        userOrder.sort((a, b) => {
            let aIndex = responsesIndexes.indexOf(classroom.students[a].pollRes.buttonRes);
            let bIndex = responsesIndexes.indexOf(classroom.students[b].pollRes.buttonRes);

            if (aIndex === -1) aIndex = Infinity;
            if (bIndex === -1) bIndex = Infinity;

            return aIndex - bIndex;
        });
    } else if (sort.responseOrder == 2) {
        let responsesIndexes = Object.keys(classroom.poll.responses);
        userOrder.sort((a, b) => {
            let aIndex = responsesIndexes.indexOf(classroom.students[a].pollRes.buttonRes);
            let bIndex = responsesIndexes.indexOf(classroom.students[b].pollRes.buttonRes);

            if (aIndex === -1) aIndex = Infinity;
            if (bIndex === -1) bIndex = Infinity;

            return bIndex - aIndex;
        });
    }

    // sort by response text
    if (sort.responseText == 1) {
        userOrder.sort((a, b) => {
            return classroom.students[a].pollRes.textRes.localeCompare(classroom.students[b].pollRes.textRes);
        });
    } else if (sort.responseText == 2) {
        userOrder.sort((a, b) => {
            return classroom.students[b].pollRes.textRes.localeCompare(classroom.students[a].pollRes.textRes);
        });
    }

    // sort by response time
    if (sort.responseTime == 1) {
        userOrder.sort((a, b) => {
            return classroom.students[a].pollRes.time - classroom.students[b].pollRes.time;
        });
    } else if (sort.responseTime == 2) {
        userOrder.sort((a, b) => {            
            return classroom.students[b].pollRes.time - classroom.students[a].pollRes.time;
        });
    }

    // sort by response time
    if (sort.helpTime == 1) {
        userOrder.sort((a, b) => {
            if(!classroom.students[a].help) return 0;
            if(!classroom.students[b].help) return 0;
            return classroom.students[a].help.time - classroom.students[b].help.time;
        });
    } else if (sort.helpTime == 2) {
        userOrder.sort((a, b) => {        
            if(!classroom.students[a].help) return 0;
            if(!classroom.students[b].help) return 0;    
            return classroom.students[b].help.time - classroom.students[a].help.time;
        });
    }

    // sort by permissions
    if (sort.permissions == 1) {
        userOrder.sort((a, b) => classroom.students[a].classPermissions - classroom.students[b].classPermissions)
    } else if (sort.permissions == 2) {
        userOrder.sort((a, b) => classroom.students[b].classPermissions - classroom.students[a].classPermissions)
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
        filter[filterElement.id] == 1 ? filter[filterElement.id] = 0 : filter[filterElement.id] = 1

        if (filter[filterElement.id] == 0) {
            filterElement.classList.remove('pressed')
            filterElement.textContent = FilterState[filterElement.id]
        } else {
            filterElement.classList.add('pressed')
            filterElement.innerHTML = FilterState[filterElement.id] + `<img src="/img/checkmark-outline.svg" alt=${FilterState[filterElement.id]}>`
        }


        // Update the filter settings in the database
        socket.emit("setClassSetting", "filter", filter);
        settings.filter = filter;

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
                let otherSortElement = document.querySelector('.sort#' + sortType)
                if (otherSortElement) {
                    otherSortElement.classList.remove('pressed')
                    let otherSortIcon = otherSortElement.querySelector('div').getElementsByClassName('currentSortIcon')[0];
                    otherSortIcon.src = '/img/swap-vertical-up.svg';
                    otherSortIcon.style.opacity = 0;
                }
            }
        }
        
        let sortIcon = sortElement.querySelector('div').getElementsByClassName('currentSortIcon')[0];

        switch(sort[sortElement.id]) {
            case 0:
                sortIcon.src = '/img/swap-vertical-up.svg';
                sortIcon.style.opacity = 1;
                break;
            case 1:
                sortIcon.src = '/img/swap-vertical-down.svg';
                sortIcon.style.opacity = 1;
                break;
            case 2:
                sortIcon.src = '/img/swap-vertical-up.svg';
                sortIcon.style.opacity = 0;
                break;
        }

        sort[sortElement.id] += 1
        if (sort[sortElement.id] > 2) {
            sort[sortElement.id] = 0
        }

        if (sort[sortElement.id] == 0) {
            sortElement.classList.remove('pressed')
        } else {
            sortElement.classList.add('pressed')
        }

        socket.emit("setClassSetting", "sort", sort);
        settings.sort = sort;

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