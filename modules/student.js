const { database } = require("./database")
const { STUDENT_PERMISSIONS } = require("./permissions")

// This class is used to create a student to be stored in the sessions data
class Student {
	// Needs username, id from the database, and if permissions established already pass the updated value
	// These will need to be put into the constructor in order to allow the creation of the object
	constructor(
		username,
		email,
		id,
		permissions = STUDENT_PERMISSIONS,
		API,
		ownedPolls = [],
		sharedPolls = [],
		tags,
		displayName
	) {
		this.username = username
		this.email = email
		this.id = id
		this.activeClasses = []
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

function getStudentId(username) {
	return new Promise((resolve, reject) => {
		database.get('SELECT id FROM users WHERE username=?', username, (err, row) => {
			if (err) return reject(err)
			resolve(row.id)
		})
	})
}

module.exports = {
	Student,
	getStudentId
}