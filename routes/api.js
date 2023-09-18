const express = require('express')
const router = express.Router()

const api = (cD) => {
	router.get('/', (request, response) => {
		response.json({ hi: cD })
	})

	router.get('/me', (request, response) => {
		response.json(cD[request.session.class].students[request.session.user])
	})

	router.get('/class/:key', (request, response) => {
		let key = request.params.key
		response.json(cD[key])
	})

	router.get('/class/:key/students', (request, response) => {
		let key = request.params.key
		response.json(cD[key].students)
	})

	return router
}

module.exports = api