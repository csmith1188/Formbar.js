// @TODO: Clean this file up further

// Permissions range from highest to lowest
const MANAGER_PERMISSIONS = 5
const TEACHER_PERMISSIONS = 4
const MOD_PERMISSIONS = 3
const STUDENT_PERMISSIONS = 2
const GUEST_PERMISSIONS = 1
const BANNED_PERMISSIONS = 0

// Permission level needed to access each page
// This line declares a constant object named PAGE_PERMISSIONS. The { symbol indicates the start of the object.
const PAGE_PERMISSIONS = {
	/* This line defines a propery of the PAGE_PERMISSIONS object named controlPanel. The value of this property is another object with two properties:
	permissions and classPage. The permissions property is set to MOD_PERMISSIONS, which is a constant defined earlier that specified the permissions required
	to access the control panel. The classPage property is set to true, as the control panel is a page relating to classes. */
	controlPanel: { permissions: MOD_PERMISSIONS, classPage: true },

	/* The next lines follow the same pattern as the controlPanel line. They define properties of the PAGE_PERMISSIONS object for different pages in the
	application, each with its own permissions and classPage status. */
	previousLessons: { permissions: TEACHER_PERMISSIONS, classPage: true },
	student: { permissions: GUEST_PERMISSIONS, classPage: true },
	virtualbar: { permissions: GUEST_PERMISSIONS, classPage: true },
	makeQuiz: { permissions: TEACHER_PERMISSIONS, classPage: true },
	plugins: { permissions: STUDENT_PERMISSIONS, classPage: true },
	manageClass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	createClass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	selectClass: { permissions: GUEST_PERMISSIONS, classPage: false },
	managerPanel: { permissions: MANAGER_PERMISSIONS, classPage: false }
}

//This line declares a constant object named DEFAULT_CLASS_PERMISSIONS
const DEFAULT_CLASS_PERMISSIONS = {
	/* This line defines a property of the object called games. The value of this property MOD_PERMISSIONS, which was defined earlier. This means 
	that you must have mod permissions to access the games. */
	games: MOD_PERMISSIONS,
	
    // Similarly, this line defines a property controlPolls with a value of MOD_PERMISSIONS. This mean that you must have mod permissions to control polls.
	controlPolls: MOD_PERMISSIONS,
	
    // This line defines a property manageStudents with a value of TEACHER_PERMISSIONS. This means that you must have teacher permissions to manage students.
	manageStudents: TEACHER_PERMISSIONS,
	
    /* This line defines a property breakAndHelp with a value of MOD_PERMISSIONS. This means that you must have mod permissions to approve break and help
	related actions. */
	breakAndHelp: MOD_PERMISSIONS,
	
    // This line defines a property manageClass with a value of TEACHER_PERMISSIONS. This means that you must have teacher permissions to manage the class.
	manageClass: TEACHER_PERMISSIONS,
	
    // This line defines a property lights with a value of MOD_PERMISSIONS. This means that you must have mod permissions to control the FormPix lights.
	lights: MOD_PERMISSIONS,
	
    // This line defines a property sounds with a value of MOD_PERMISSIONS. This means that you must have mod permissions to control the FormPix sounds.
	sounds: MOD_PERMISSIONS,
	
    // This line defines a property userDefaults with a value of GUEST_PERMISSIONS. This means that you must have guest permissions to gain basic user defaults.
	userDefaults: GUEST_PERMISSIONS
}


/*This line declares a constant object named GLOBAL_SOCKET_PERMISSIONS. The const keyword mean that the variable cannot be reassigned. However,
the properties of the object can still be modified.*/
const GLOBAL_SOCKET_PERMISSIONS = {
	//This represents an event that changes permissions which requires manager permissions.
	permChange: MANAGER_PERMISSIONS,
	//This represents an event that deletes a class which requires teacher permissions.
	deleteClass: TEACHER_PERMISSIONS,
	//This represents an event that gets all classes you own which requires teacher permissions.
	getOwnedClasses: TEACHER_PERMISSIONS,
	//This represents an event that logs you out which requires guest permissions.
	logout: GUEST_PERMISSIONS,
	//This represents an event that gets all classes you are in which requires guest permissions.
	getUserClass: GUEST_PERMISSIONS,
	//This represents an event that deletes a user which requires manager permissions.
	deleteUser: MANAGER_PERMISSIONS,
	//This represents an event that updates the manager panel which requires manager permissions.
	managerUpdate: MANAGER_PERMISSIONS,
	//This represents an event that updates the ip address list which requires manager permissions.
	ipUpdate: MANAGER_PERMISSIONS,
	//This represents an event that adds an ip address to the list which requires manager permissions.
	addIp: MANAGER_PERMISSIONS,
	//This represents an event that removes an ip address from the list which requires manager permissions.
	removeIp: MANAGER_PERMISSIONS,
	//This represents an event that changes an ip address on the list which requires manager permissions.
	changeIp: MANAGER_PERMISSIONS,
	//This represents an event that gets the ip address list which requires manager permissions.
	toggleIpList: MANAGER_PERMISSIONS,
	//This represents an event that saves the tags list which requires teacher permissions.
	saveTags: TEACHER_PERMISSIONS,
	//This represents an event that creates a new tag which requires teacher permissions.
	newTag: TEACHER_PERMISSIONS,
	//This represents an event that removes a tag which requires teacher permissions.
	removeTag: TEACHER_PERMISSIONS,
	//This represents an event that submits a password change request which requires student permissions.
	passwordRequest: STUDENT_PERMISSIONS,
	//This represents an event that approves the password change request which requires manager permissions.
	approvePasswordChange: MANAGER_PERMISSIONS,
	//This represents an event that updates the password which requires manager permissions.
	passwordUpdate: MANAGER_PERMISSIONS
}

//This line declares a constant object CLASS_SOCKET_PERMISSIONS. The const keyword means that the variable can't be reassigned.
const CLASS_SOCKET_PERMISSIONS = {
	//This line defines a property named help that requires student permissions, which was defined earlier in the code. 
	help: STUDENT_PERMISSIONS,
	/*These lines define actions like responding to a poll, requesting a break, ending a break, updating a poll, updating the mode, updating a quiz,
	and updating a lesson. All of these actions require student permissions.*/
	pollResp: STUDENT_PERMISSIONS,
	requestBreak: STUDENT_PERMISSIONS,
	endBreak: STUDENT_PERMISSIONS,
	pollUpdate: STUDENT_PERMISSIONS,
	modeUpdate: STUDENT_PERMISSIONS,
	quizUpdate: STUDENT_PERMISSIONS,
	lessonUpdate: STUDENT_PERMISSIONS,
	//These lines define actions like updating the virtual bar, the virtual bar timer, and leaving a class. These actions require guest permissions.
	vbUpdate: GUEST_PERMISSIONS,
	vbTimer: GUEST_PERMISSIONS,
	leaveClass: GUEST_PERMISSIONS,
	//This line defines an action that updates the control panel, which requires mod permissions.
	cpUpdate: MOD_PERMISSIONS,
	//This line defines an action that displays a previous poll, which requires teacher permissions.
	previousPollDisplay: TEACHER_PERMISSIONS,
	//This line defines an action of updating the plugin list, which requires student permissions.
	pluginUpdate: STUDENT_PERMISSIONS,
	//This line defines an action of setting the class default permission setting, which requires manager permissions.
	setClassPermissionSetting: MANAGER_PERMISSIONS,
	//This line defines an action that starts a class poll, which requires mod permissions.
	classPoll: MOD_PERMISSIONS,
	//These lines define actions like creating a timer, and turning it on, which require teacher permissions.
	timer: TEACHER_PERMISSIONS,
	timerOn: TEACHER_PERMISSIONS
}

// make a better name for this
const CLASS_SOCKET_PERMISSION_SETTINGS = {
	/*This line maps the action startPoll to the permission associated with controlPolls. This means that in order to start a poll, a user must 
	have the permissions associated with controlPolls.*/
	startPoll: 'controlPolls',
	//Similarly, to clear a poll, a user must have the permissions associated with controlPolls.
	clearPoll: 'controlPolls',
	//To end a poll, a user must have the permissions associated with controlPolls.
	endPoll: 'controlPolls',
	//To update the custom poll list, a user must have the permissions associated with controlPolls.
	customPollUpdate: 'controlPolls',
	//To save a poll to the custom poll list, a user must have the permissions associated with controlPolls.
	savePoll: 'controlPolls',
	//To delete a poll from the custom poll list, a user must have the permissions associated with controlPolls.
	deletePoll: 'controlPolls',
	//To set a poll as public, a user must have the permissions associated with controlPolls.
	setPublicPoll: 'controlPolls',
	//To share a poll with a user, a user must have the permissions associated with controlPolls.
	sharePollToUser: 'controlPolls',
	//To remove a shared poll with a user, a user must have the permissions associated with controlPolls.
	removeUserPollShare: 'controlPolls',
	//To get the ids of shared polls, a user must have the permissions associated with controlPolls.
	getPollShareIds: 'controlPolls',
	//To share a poll with a class, a user must have the permissions associated with controlPolls.
	sharePollToClass: 'controlPolls',
	//To remove a shared poll from a class, a user must have the permissions associated with controlPolls.
	removeClassPollShare: 'controlPolls',
	//To perform the next step in a lesson, a user must have the permissions associated with controlPolls.
	doStep: 'controlPolls',
	//To change permissions in a class, a user must have the permissions associated with manageStudents.
	classPermChange: 'manageStudents',
	//To kick a user from a class, a user must have the permissions associated with manageStudents.
	classKickUser: 'manageStudents',
	//To kick all users from a class, a user must have the permissions associated with manageStudents.
	classKickStudents: 'manageStudents',
	//To approve a break, a user must have the permissions associated with breakAndHelp.
	approveBreak: 'breakAndHelp',
	//To delete a ticket, a user must have the permissions associated with breakAndHelp.
	deleteTicket: 'breakAndHelp',
	//To change a plugin in the plugin list, a user must have the permissions associated with manageClass.
	changePlugin: 'manageClass',
	//To add a plugin to the plugin list, a user must have the permissions associated with manageClass.
	addPlugin: 'manageClass',
	//To remove a plugin from the plugin list, a user must have the permissions associated with manageClass.
	removePlugin: 'manageClass',
	//To end a class, a user must have the permissions associated with manageClass.
	endClass: 'manageClass',
	//To change the mode of a class, a user must have the permissions associated with manageClass.
	modechange: 'manageClass',
	//To update the list of banned users in a class, a user must have the permissions associated with manageStudents.
	classBannedUsersUpdate: 'manageStudents',
	//To ban a user from a class, a user must have the permissions associated with manageStudents.
	classBanUser: 'manageStudents',
	//To unban a user from a class, a user must have the permissions associated with manageStudents.
	classUnbanUser: 'manageStudents',
}

module.exports = {
    MANAGER_PERMISSIONS,
    TEACHER_PERMISSIONS,
    MOD_PERMISSIONS,
    STUDENT_PERMISSIONS,
    GUEST_PERMISSIONS,
    BANNED_PERMISSIONS,

    PAGE_PERMISSIONS,
    DEFAULT_CLASS_PERMISSIONS,

	GLOBAL_SOCKET_PERMISSIONS,
	CLASS_SOCKET_PERMISSIONS,
	CLASS_SOCKET_PERMISSION_SETTINGS
}