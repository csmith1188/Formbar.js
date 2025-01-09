const { classInformation, getClassIDFromCode } = require("../../modules/class")
const { getUser } = require("../../modules/user")
const { logger } = require("../../modules/logger")

module.exports = {
    run(router) {
        router.get('/apiPermissionCheck', async (req, res) => {
			try {
				let { api, permissionType } = req.query

				let permissionTypes = {
					games: null,
					lights: null,
					sounds: null
				}

				if (!api) {
					res.status(400).json({ error: 'No API provided.' })
					return
				}

				if (!permissionType) {
					res.status(400).json({ error: 'No permissionType provided.' })
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

				if (!user.class) {
					res.status(403).json({ reason: 'User is not in a class.' })
					return
				}

				const classroomId = getClassIDFromCode(user.class)
				const classroom = classInformation.classrooms[classroomId]

				permissionTypes.games = classroom.permissions.games
				permissionTypes.lights = classroom.permissions.lights
				permissionTypes.sounds = classroom.permissions.sounds

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