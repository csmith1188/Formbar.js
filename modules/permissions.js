// Permissions range from highest to lowest
const MANAGER_PERMISSIONS = 5
const TEACHER_PERMISSIONS = 4
const MOD_PERMISSIONS = 3
const STUDENT_PERMISSIONS = 2
const GUEST_PERMISSIONS = 1
const BANNED_PERMISSIONS = 0

// Permission level needed to access each page along with if it's a class-related page or not
const PAGE_PERMISSIONS = {
	controlpanel: { permissions: MOD_PERMISSIONS, classPage: true },
	student: { permissions: GUEST_PERMISSIONS, classPage: true },
	virtualbar: { permissions: GUEST_PERMISSIONS, classPage: true },
	manageclass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	createclass: { permissions: TEACHER_PERMISSIONS, classPage: false },
	selectclass: { permissions: GUEST_PERMISSIONS, classPage: false },
	managerpanel: { permissions: MANAGER_PERMISSIONS, classPage: false },
	downloaddatabase: { permissions: MANAGER_PERMISSIONS, classPage: false },
	logs: { permissions: MANAGER_PERMISSIONS, classPage: false },
	profile: { permissions: STUDENT_PERMISSIONS, classPage: false }
}

const CLASS_PERMISSIONS = {
    GAMES: 'games',
    CONTROL_POLLS: 'controlPolls',
    MANAGE_STUDENTS: 'manageStudents',
    MANAGE_CLASS: 'manageClass',
    BREAK_AND_HELP: 'breakAndHelp',
    AUXILIARY: 'auxiliary',
    USER_DEFAULTS: 'userDefaults',
}

// Defines the default permissions for people in a class
const DEFAULT_CLASS_PERMISSIONS = {
	games: MOD_PERMISSIONS, // Control the games	
	controlPolls: MOD_PERMISSIONS,	
	manageStudents: TEACHER_PERMISSIONS,
	breakAndHelp: MOD_PERMISSIONS, // Approve break and help requests
	manageClass: TEACHER_PERMISSIONS,
    auxiliary: MOD_PERMISSIONS, // Controls the FormPix lights and sounds
    userDefaults: GUEST_PERMISSIONS
}

// This defines global socket permissions that define who can use each socket event
const GLOBAL_SOCKET_PERMISSIONS = {
	permChange: MANAGER_PERMISSIONS,
	verifyChange: MANAGER_PERMISSIONS,
	deleteClass: TEACHER_PERMISSIONS,
	getOwnedClasses: TEACHER_PERMISSIONS,
	logout: GUEST_PERMISSIONS,
	deleteUser: MANAGER_PERMISSIONS,
	banUser: MANAGER_PERMISSIONS,
	ipUpdate: MANAGER_PERMISSIONS,
	addIp: MANAGER_PERMISSIONS,
	removeIp: MANAGER_PERMISSIONS,
	changeIp: MANAGER_PERMISSIONS,
	toggleIpList: MANAGER_PERMISSIONS,
	saveTags: TEACHER_PERMISSIONS,
	setTags: TEACHER_PERMISSIONS,
	passwordUpdate: MANAGER_PERMISSIONS,
	joinClass: GUEST_PERMISSIONS,
	joinRoom: GUEST_PERMISSIONS,
	getActiveClass: GUEST_PERMISSIONS,
	refreshApiKey: STUDENT_PERMISSIONS,
    refreshPin: STUDENT_PERMISSIONS,
	transferDigipogs: STUDENT_PERMISSIONS,
	transferDigipogsResult: STUDENT_PERMISSIONS,
	awardDigipogs: TEACHER_PERMISSIONS,
	awardDigipogsResponse: TEACHER_PERMISSIONS,
}

// This defines socket permissions for the class that define who can use each socket event
const CLASS_SOCKET_PERMISSIONS = {
	help: STUDENT_PERMISSIONS,
	pollResp: STUDENT_PERMISSIONS,
	requestBreak: STUDENT_PERMISSIONS,
	endBreak: STUDENT_PERMISSIONS,
	vbTimer: GUEST_PERMISSIONS,
	leaveClass: GUEST_PERMISSIONS,
	leaveRoom: GUEST_PERMISSIONS,
    classUpdate: GUEST_PERMISSIONS,
	setClassSetting: TEACHER_PERMISSIONS,
	setClassPermissionSetting: MANAGER_PERMISSIONS,
	classPoll: MOD_PERMISSIONS,
	timer: TEACHER_PERMISSIONS,
	timerOn: TEACHER_PERMISSIONS,
	getCanVote: STUDENT_PERMISSIONS,
	changeCanVote: TEACHER_PERMISSIONS,
	awardDigipogs: TEACHER_PERMISSIONS,
	requestConversion: STUDENT_PERMISSIONS,
	getPreviousPolls: TEACHER_PERMISSIONS,
}

// This associates actions with the permissions of other actions
// Example: To start a poll, you first need the controlPolls permission
const CLASS_SOCKET_PERMISSION_MAPPER = {
	startPoll: 'controlPolls',
	clearPoll: 'controlPolls',
	endPoll: 'controlPolls',
	customPollUpdate: 'controlPolls',
	savePoll: 'controlPolls',
	deletePoll: 'controlPolls',
	setPublicPoll: 'controlPolls',
	sharePollToUser: 'controlPolls',
	removeUserPollShare: 'controlPolls',
	getPollShareIds: 'controlPolls',
	sharePollToClass: 'controlPolls',
	removeClassPollShare: 'controlPolls',
	classPermChange: 'manageStudents',
	classKickUser: 'manageStudents',
	classKickStudents: 'manageStudents',
	approveBreak: 'breakAndHelp',
	deleteTicket: 'breakAndHelp',
	changePlugin: 'manageClass',
	addPlugin: 'manageClass',
	removePlugin: 'manageClass',
	startClass: 'manageClass',
	endClass: 'manageClass',
	isClassActive: 'manageClass',
	regenerateClassCode: 'manageClass',
	changeClassName: 'manageClass',
	classBannedUsersUpdate: 'manageStudents',
	classBanUser: 'manageStudents',
	classUnbanUser: 'manageStudents',
	awardDigipogs: 'userDefaults',
	requestConversion: 'userDefaults',
}

module.exports = {
	// Permissions
    MANAGER_PERMISSIONS,
    TEACHER_PERMISSIONS,
    MOD_PERMISSIONS,
    STUDENT_PERMISSIONS,
    GUEST_PERMISSIONS,
    BANNED_PERMISSIONS,

	// Page permissions
    PAGE_PERMISSIONS,
    CLASS_PERMISSIONS,
    DEFAULT_CLASS_PERMISSIONS,

	// Socket permissions
	GLOBAL_SOCKET_PERMISSIONS,
	CLASS_SOCKET_PERMISSIONS,
	CLASS_SOCKET_PERMISSION_MAPPER
}