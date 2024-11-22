class Quiz {
	constructor(numOfQuestions, maxScore) {
		this.questions = []
		this.totalScore = maxScore
		this.numOfQuestions = numOfQuestions
		this.pointsPerQuestion = this.totalScore / numOfQuestions
	}
}

class Lesson {
	constructor(date, content) {
		this.date = date
		this.content = content
	}
}

module.exports = {
    Quiz,
    Lesson
}