const { classInformation } = require("./class");
const { database } = require("./database")
const { STUDENT_PERMISSIONS } = require("./permissions")
const { logger } = require("./logger");

// This class is used to create a student to be stored in the sessions data
class Student {
	// Needs email, id from the database, and if permissions established already pass the updated value
	// These will need to be put into the constructor in order to allow the creation of the object
	constructor(
		email,
		id,
		permissions = STUDENT_PERMISSIONS,
		API,
		ownedPolls = [],
		sharedPolls = [],
		tags,
		displayName,
		isGuest = false
	) {
		this.email = email;
		this.id = id;
		this.activeClasses = [];
		this.permissions = permissions;
		this.classPermissions = null;
		this.tags = tags;
		this.ownedPolls = ownedPolls || [];
		this.sharedPolls = sharedPolls || [];
		this.pollRes = {
			buttonRes: '',
			textRes: '',
			time: null
		};
		this.help = false;
		this.break = false;
		this.quizScore = '';
		this.API = API;
		this.pogMeter = 0;
		this.displayName = displayName;
		this.isGuest = isGuest;
	};
};

/**
 * Retrieves the students in a class from the database.
 * Creates an actual student class for each student rather than just returning their data.
 * @param {integer} id - The class id.
 * @returns {Promise|Object} A promise that resolves to the class users or an error object.
 */
async function getStudentsInClass(classId) {
	// Grab students associated with the class
	const studentIdsAndPermissions = await new Promise((resolve, reject) => {
		database.all('SELECT studentId, permissions FROM classusers WHERE classId = ?', [classId], (err, rows) => {
			if (err) {
				logger.log('error', err.stack);
				return reject(err);
			}

			const studentIdsAndPermissions = rows.map(row => ({
				id: row.studentId,
				permissions: row.permissions
			}));

			resolve(studentIdsAndPermissions);
		});
	});


	// Get student ids in the class user data
	const studentIds = studentIdsAndPermissions.map(student => student.id);
	const studentsData = await new Promise((resolve, reject) => {
		database.all('SELECT * FROM users WHERE id IN (' + studentIds.map(() => '?').join(',') + ')', studentIds, (err, rows) => {
			if (err) {
				logger.log('error', err.stack);
				return reject(err);
			}

			const studentData = {};
			for (const row of rows) {
				studentData[row.email] = row;
			}

			resolve(studentData);
		});
	});

	// Create student class and return the data
	const students = {};
	for (const email in studentsData) {
		const userData = studentsData[email];
		const studentPermissions = studentIdsAndPermissions.find(student => student.id === userData.id).permissions;
		students[email] = new Student(
			userData.email,
			userData.id,
			userData.permissions,
			userData.API,
			[],
			[],
			userData.tags,
			displayName = userData.displayName,
			false
		);
		
		students[email].classPermissions = studentPermissions;
	};

	return students;
}

function getStudentId(email) {
	try {
		// If the user is already loded, return the id
		if (classInformation.users[email]) {
			return classInformation.users[email].id
		}
	
		// If the user isn't loaded, get the id from the database
		return new Promise((resolve, reject) => {
			database.get('SELECT id FROM users WHERE email=?', email, (err, row) => {
				if (err) return reject(err)
				resolve(row.id)
			})
		})
	} catch (err) {
		logger.log('error', err.stack)
	}
}

module.exports = {
	Student,
	getStudentsInClass,
	getStudentId
}
