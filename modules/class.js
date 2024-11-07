// @TODO: Clean this up; simply separating code for now

// This class is used to add a new classroom to the session data
// The classroom will be used to add lessons, do lessons, and for the teacher to operate them
class Classroom {
	// Needs the name of the class you want to create
	constructor(id, className, key, permissions, sharedPolls, pollHistory, tags) {
		this.id = id
		this.className = className
		this.students = {}
		this.sharedPolls = sharedPolls || []
		this.poll = {
			status: false,
			responses: {},
			textRes: false,
			prompt: '',
			weight: 1,
			blind: false,
			requiredTags: [],
			studentBoxes: [],
			studentIndeterminate: [],
			lastResponse: [],
			allowedResponses: []
		}
		this.key = key
		this.lesson = {}
		this.activeLesson = false
		this.steps
		this.currentStep = 0
		this.quiz = false
		this.mode = 'poll'
		this.permissions = permissions
		this.pollHistory = pollHistory || []
		this.tagNames = tags || [];
		this.timer = {
			startTime: 0,
			timeLeft: 0,
			active: false,
			sound: false
		}
	}
}

function createClassInformation() {
    return {
        noClass: { students: {} }
    }
}

module.exports = {
    Classroom,
    
    // classInformation stores all of the information on classes and students
    /* This line declares a variable classInformation and assigns it an object. This object has a single property, named noClass, which is itself an object with a single
    property, named students. The students property is an empty object that gets added to later. This structure is used to store classes and their students
    in a nested manner. */
    classInformation: createClassInformation()
}