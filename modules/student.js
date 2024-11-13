const { io } = require("./webServer")

// This class is used to create a student to be stored in the sessions data
class Student {
	// Needs username, id from the database, and if permissions established already pass the updated value
	// These will need to be put into the constructor in order to allow the creation of the object
	constructor(
		username,
		id,
		permissions = STUDENT_PERMISSIONS,
		API,
		ownedPolls = [],
		sharedPolls = [],
		tags,
		displayName
	) {
		this.username = username
		this.id = id
		this.permissions = permissions
		this.classPermissions = null
		this.tags = tags
		this.ownedPolls = ownedPolls || []
		this.sharedPolls = sharedPolls || []
		this.pollRes = {
			buttonRes: '',
			textRes: '',
			time: null
		}
		this.help = false
		this.break = false
		this.quizScore = ''
		this.API = API
		this.pogMeter = 0
		this.displayName = displayName
	}
}

async function passwordRequest(newPassword, username) {
	if (newPassword && username) {
		let passwordChange = true;
		io.emit("passwordUpdate", passwordChange, username, newPassword);
	};
};

function getUserClass(username) {
	try {
		logger.log('info', `[getUserClass] username=(${username})`)

		for (let classCode of Object.keys(classInformation)) {
			if (classInformation[classCode].students[username]) {
				logger.log('verbose', `[getUserClass] classCode=(${classCode})`)
				return classCode
			}
		}

		logger.log('verbose', `[getUserClass] classCode=(${null})`)
		return null
	} catch (err) {
		return err
	}
}

module.exports = {
	Student,
    passwordRequest,
	getUserClass
}