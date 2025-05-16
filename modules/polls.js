/**
 * Function to get the poll responses in a class.
 * @param {Object} classData - The data of the class.
 * @returns {Object} An object containing the poll responses.
 */
function getPollResponses(classData) {
    // Create an empty object to store the poll responses
    let tempPolls = {}

    // If the poll is not active, return an empty object
    if (!classData.poll.status) return {}

    // If there are no responses to the poll, return an empty object
    if (Object.keys(classData.poll.responses).length == 0) return {}

    // For each response in the poll responses
    for (let [resKey, resValue] of Object.entries(classData.poll.responses)) {
        // Add the response to the tempPolls object and initialize the count of responses to 0
        tempPolls[resKey] = {
            ...resValue,
            responses: 0
        }
    }

    // For each student in the class
    for (let student of Object.values(classData.students)) {
        // If the student exists and has responded to the poll
        if (student && Object.keys(tempPolls).includes(student.pollRes.buttonRes)) {
            // Increment the count of responses for the student's response
            tempPolls[student.pollRes.buttonRes].responses++
        }
    }

    // Return the tempPolls object
    return tempPolls
}

module.exports = { getPollResponses }