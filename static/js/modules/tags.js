function getTags() {
    const classTags = classroom.tags || [];
    let tags = [];
    for (const tag of classTags) {
        if (tag === "" || tag === "Offline") continue;
        tags.push(tag);
    }
    return tags;
}

// Sends the tags to the server
function sendTags(tags) {
    socket.emit('setTags', tags);
}

// Creates a tag element in the tag div
function addTagElement(tag) {
    if (tag == "" || tag == "Offline" || tag == null) return
    let tagOption = document.createElement('div')
    tagOption.value = tag
    tagOption.className = 'tagOption'
    tagOption.textContent = tag

    let removeButton = document.createElement('button')
    removeButton.className = 'squareButton warningButton'
    removeButton.innerHTML = '<img src="/img/trash-outline.svg" alt="Remove tag">'
    removeButton.onclick = () => {
        tagsDiv.removeChild(tagOption)
        classroom.tags = classroom.tags.filter(t => t !== tag)
        sendTags(classroom.tags)
        updateStudentTags()
    }

    tagOption.appendChild(removeButton)
    tagsDiv.appendChild(tagOption)
}

// Update the tag buttons for each student
function updateStudentTags() {
    const tags = getTags();
    for (const student of usersDiv.querySelectorAll('.controlStudent')) {
        // Get student tag elements
        const roomTags = student.querySelector('#roomTags');
        const studTagsSpan = student.querySelector('#studentTags');
        const studentId = student.id.split('-')[1];
        const studentData = students.find((s) => s.id?.toString() === studentId);

        // Get tags selected before the update
        const oldTags = [];
        if (roomTags) {
            for (let tagButton of roomTags.querySelectorAll('button.pressed')) {
                oldTags.push(tagButton.textContent);
            }
        }

        // Clear room tags
        if (studTagsSpan) studTagsSpan.innerHTML = '';
        if (roomTags) roomTags.innerHTML = '';

        // If the student has tags, check if it's a valid tag in tagsDiv children
        // If it's not, then remove the tag from the studentData tags
        if (studentData && Array.isArray(studentData.tags)) {
            studentData.tags = studentData.tags.filter(tag => {
                const tagElement = Array.from(tagsDiv.children).find((tagElement) => tagElement.value === tag);
                return !!tagElement;
            });
        }

        for (const tag of tags) {
            let button = document.createElement('button');
            button.innerHTML = tag
            button.name = `button${tag}`;
            button.value = tag;
            button.onclick = function () {
                if (!button.classList.contains('pressed')) {
                    button.classList.add('pressed')
                    let span = document.createElement('span');
                    span.textContent = tag;
                    span.setAttribute('id', tag);
                    if (studTagsSpan) studTagsSpan.appendChild(span);

                    // If the studentData does not have tags, add the tag
                    if (Array.isArray(studentData.tags)) {
                        if (!studentData.tags.includes(tag)) studentData.tags.push(tag);
                    } else {
                        studentData.tags = [tag];
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
                    if (Array.isArray(studentData.tags)) {
                        studentData.tags = studentData.tags.filter(t => t !== tag);
                    }

                    if (studTagsSpan) {
                        const tagSpan = studTagsSpan.querySelector(`#${tag}`);
                        if (tagSpan) tagSpan.remove();
                    }
                }

                // When someone clicks on a tag, save the tags to the server
                const tags = [];
                if (roomTags) {
                    for (let tagButton of roomTags.querySelectorAll('button.pressed')) {
                        tags.push(tagButton.textContent);
                    }
                    socket.emit('saveTags', studentData.id, tags);
                }

                createTagSelectButtons();
            }

            for (const oldTag of oldTags) {
                if (oldTag == tag) {
                    button.classList.add('pressed')
                }
            }

            if (roomTags) roomTags.appendChild(button);
        }
    }
}