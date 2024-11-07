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

module.exports = {
    MANAGER_PERMISSIONS,
    TEACHER_PERMISSIONS,
    MOD_PERMISSIONS,
    STUDENT_PERMISSIONS,
    GUEST_PERMISSIONS,
    BANNED_PERMISSIONS,

    PAGE_PERMISSIONS,
    DEFAULT_CLASS_PERMISSIONS
}