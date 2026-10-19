import { FORMBAR_URL, Task } from "./app.js";
export default class Bot {
    id;
    email = '';
    password = '';
    displayName = '';
    accessToken = '';
    refreshToken = '';
    formbarId = 0;
    apiKey = '';
    inRoom = 0;
    classInfo = {};
    formbarMe = {};
    constructor(id) {
        this.id = id;
    }

    async makeAccount() {
        let task = new Task('Make Account');
        const url = `${FORMBAR_URL}/api/v1/auth/register`;
        const body = {
            email: `bot${this.id}@a.com`,
            password: `bot${this.id}!!`,
            displayName: `Test Bot ${this.id}`
        };
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(body)
            });
        } catch {
            return task.finish(false);
        }
        const data = await response.json();
        if (data.success === true) {
            task.finish(true);
            this.accessToken = data.data.accessToken;
            this.refreshToken = data.data.refreshToken;
            this.formbarId = data.data.user.id;
            await this.getApi();
        }
        else {
            task.finish(false);
            await this.logIn();
        }
    }

    async getMe() {
        let task = new Task('Get Me');
        const url = `${FORMBAR_URL}/api/v1/user/me`;
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
        } catch {
            return task.finish(false);
        }
        const data = await response.json();
        if (data.success === true) {
            task.finish(true);
            this.formbarMe = data.data;
            this.formbarId = this.formbarMe.id;
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }

    async logIn() {
        let task = new Task('Log In');
        const url = `${FORMBAR_URL}/api/v1/auth/login`;
        const body = {
            email: `bot${this.id}@a.com`,
            password: `bot${this.id}!!`,
        };
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(body)
            });
        } catch {
            return task.finish(false);
        }
        const data = await response.json();
        if (data.success === true) {
            task.finish(true);
            this.accessToken = data.data.accessToken;
            this.refreshToken = data.data.refreshToken;
            await this.getMe();
            await this.getApi();
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }

    async getApi() {
        let task = new Task(`Get API Key`);
        const url = `${FORMBAR_URL}/api/v1/user/${this.formbarId}/api/regenerate`;
        if (!this.accessToken) {
            throw new Error('Access token is not set');
        }
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
        } catch {
            return task.finish(false);
        }
        const data = await response.json();
        if (data.success === true) {
            task.finish(true);
        }
        else {
            task.finish(false);
        }
    }

    async enroll(code) {
        let task = new Task(`Enroll in Class ${code}`);
        const url = `${FORMBAR_URL}/api/v1/class/enroll/${code}`;
        let response
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
        } catch {
            return task.finish(false)
        }
        const data = await response.json();
        if (data.success === true) {
            this.inRoom = data.data.roomId;
            await this.getMe();
            await this.getClass();
            task.finish(true);
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }

    async leave() {
        let task = new Task(`Leave Room ${this.inRoom}`);
        const url = `${FORMBAR_URL}/api/v1/class/${this.inRoom}/unenroll`;
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
        } catch {
            return task.finish(false);
        }
        const data = await response.json();
        if (data.success === true) {
            task.finish(true);
            this.inRoom = 0;
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }

    async getClass() {
        await this.getMe();
        let task = new Task('Get Class Info');
        const url = `${FORMBAR_URL}/api/v1/class/${this.inRoom}`;
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
        } catch {
            return task.finish(false);
        }
        const data = await response.json();
        if (data.success === true) {
            task.finish(true);
            this.classInfo = data.data;
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }

    async vote(answer) {
        let task = new Task(`Vote ${answer}`);
        if (!this.classInfo.isActive && !this.classInfo.poll || !this.classInfo.poll?.responses) {
            task.finish(false);
            return false;
        }
        let body;
        const url = `${FORMBAR_URL}/api/v1/class/${this.inRoom}/polls/response`;
        if (answer == 'RANDOM') {
            await this.getClass();
            let allResponses = this.classInfo.poll.responses.map((response) => {
                return {
                    id: response.id,
                    answer: response.answer
                };
            });
            let rand = Math.floor(Math.random() * allResponses.length);
            let pollResponse = allResponses[rand];
            if (pollResponse && pollResponse.answer) {
                body = { response: [pollResponse.answer] };
            } else {
                return task.finish = (false)
            }
        }
        else {
            body = { response: [answer] };
        }
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(body)
            });
        } catch {
            return task.finish(false);
        }
        const data = await response.json();
        if (data.success === true) {
            task.finish(true);
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }

    async requestBreak() {
        let task = new Task('Request Break')
        await this.getClass()
        let body = {
            reason: "I need a break!"
        }

        try {
            response = await fetch(`${FORMBAR_URL}/api/v1/class/${this.inRoom}/break/request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(body)
            })
        } catch {
            return task.finish(false)
        }

        const data = await response.json()

        if (data.success === true) {
            task.finish(true);
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }

    async help() {
        let task = new Task('Request Help')
        await this.getClass()

        try {
            response = await fetch(`${FORMBAR_URL}/api/v1/class/${this.inRoom}/help/request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                }
            })
        } catch {
            return task.finish(false)
        }

        const data = await response.json()

        if (data.success === true) {
            task.finish(true);
            return true;
        }
        else {
            task.finish(false);
            return false;
        }
    }
}
//# sourceMappingURL=bot.js.map