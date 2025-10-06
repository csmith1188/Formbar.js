const { classInformation, getClassIDFromCode } = require("../../modules/class/classroom")
const { getUser } = require("../../modules/user/user")
const { logger } = require("../../modules/logger")

module.exports = {
	// Used for checking class permissions such as games, lights, and sounds
    run(router) {
        router.get('/apiPermissionCheck', async (req, res) => {
			try {
				let { api, permissionType, classId } = req.query

				let permissionTypes = {
					games: null,
                    auxiliary: null
				}

				if (!api) {
					res.status(400).json({ error: 'No API provided.' })
					return
				}

				if (!permissionType) {
					res.status(400).json({ error: 'No permissionType provided.' })
					return
				}

				if (!classId) {
					res.status(400).json({ error: 'No classId provided.' })
					return
				}
                
				if (!Object.keys(permissionTypes).includes(permissionType)) {
					res.status(400).json({ error: 'Invalid permissionType.' })
					return
				}

				const user = await getUser(api)
				if (!user.loggedIn) {
					res.status(403).json({ reason: 'User is not logged in.' })
					return
				}

				// Check if there is a class id set for the user
				if (!user.class) {
					res.status(403).json({ reason: 'User is not in a class.' })
					return
				}

				// Check if the user is in the requested class
				if (user.class != classId) {
					res.status(403).json({ reason: 'User is not in the requested class.' })
					return
				}

				const classroom = classInformation.classrooms[user.class]
				permissionTypes.games = classroom.permissions.games
				permissionTypes.auxiliary = classroom.permissions.auxiliary

				if (user.classPermissions < permissionTypes[permissionType]) {
					res.status(403).json({ reason: 'User does not have enough permissions.' })
					return
				}

				res.status(200).json({ allowed: true })
			} catch (err) {
				logger.log('error', err.stack)
				res.status(500).json({ error: 'There was a server error try again.' })
			}
		})
    }
}