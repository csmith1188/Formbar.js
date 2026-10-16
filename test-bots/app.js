import Bot from "./bot.js";
process.stdin.setEncoding('utf8');
const consoleIn = process.stdin;
export const FORMBAR_URL = 'http://localhost:420';
const bots = [];
let tasks = [];
let takenIds = [];
export class Task {
    id;
    task;
    finished = false;
    success = true;
    removeScheduled = false;
    constructor(task) {
        this.id = 1;
        while (takenIds.includes(this.id)) {
            this.id++;
        }
        this.task = task;
        takenIds.push(this.id);
        tasks.push(this);
    }
    finish(success) {
        this.finished = true;
        this.success = success;
    }

    remove() {
        if (this.removeScheduled) {
            return;
        }
        this.removeScheduled = true;
        setTimeout(() => {
            let interval = setInterval(() => {
                let me = tasks.find(t => t.id === this.id);
                if (me) {
                    tasks.splice(tasks.indexOf(me), 1);
                    main();
                    clearInterval(interval);
                }
            }, 0);
        }, 2000);
    }
}

async function doCommand(terms) {
    if (terms[0] == 'make' && Number(terms[1])) {
        makeBots(Number(terms[1]));
    }

    if (terms[0] == 'enroll' && terms[1] && terms[2] && String(terms[2])) {
        let amount = Number(terms[1]);
        if (terms[1] === 'all')
            amount = Infinity;
        enroll(amount, terms[2]);
    }

    if (terms[0] == 'leave' && terms[1]) {
        let amount = Number(terms[1]);
        if (terms[1] === 'all')
            amount = Infinity;
        leave(amount);
    }

    if (terms[0] == 'getClass' && terms[1]) {
        let amount = Number(terms[1]);
        if (terms[1] === 'all')
            amount = Infinity;
        getClass(amount);
    }

    if (terms[0] == 'cls' || terms[0] == 'clear') console.clear();

    if (terms[0] == 'exit') {
        await leave(Infinity)
        process.exit()
    }

    if (terms[0] == 'vote' && terms[1] && terms.length > 2) {
        let amount = Number(terms[1]);
        if (terms[1] === 'all')
            amount = Infinity;
        vote(amount, ...terms.slice(2));
    }

    if (terms[0] === 'request') {
        let amount = Number(terms[2]) || Infinity
        if (terms[1] === 'break') {
            requestBreak(amount)
        } else if (terms[1] == 'help') {
            requestHelp(amount)
        }
    }
}

async function makeBots(amount) {
    for (let i = 0; i < amount; i++) {
        let bot = new Bot(i + 1);
        bots.push(bot);
        bot.makeAccount();
        console.clear();
    }
}

async function enroll(amount, code) {
    amount = Math.min(amount, bots.length);
    for (let i = 0; i < amount; i++) {
        bots[i].enroll(code);
        console.clear();
    }
}

async function leave(amount) {
    amount = Math.min(amount, bots.length);
    for (let i = 0; i < amount; i++) {
        bots[i].leave();
    }
}

async function getClass(amount) {
    amount = Math.min(amount, bots.length);
    for (let i = 0; i < amount; i++) {
        bots[i].getClass();
    }
}

async function vote(amount, answer) {
    amount = Math.min(amount, bots.length);
    for (let i = 0; i < amount; i++) {
        bots[i].vote(answer);
    }
}

async function requestBreak(amount) {
    amount = Math.min(amount, bots.length);
    for (let i = 0; i < amount; i++) {
        bots[i].requestBreak()
    }
}

async function requestHelp(amount) {
    amount = Math.min(amount, bots.length);
    for (let i = 0; i < amount; i++) {
        bots[i].help()
    }
}

function bar(length, color) {
    return `\x1b[${color}m-\x1b[0m`.repeat(length)
}

import readline from 'readline'

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

let input = '';
process.stdout.write('\r\x1b[2K> ' + input)

process.stdin.on('keypress', async (char, key) => {
    console.clear()
    main()
    if (key.ctrl && key.name === 'c') {
        await leave(Infinity)
        process.exit()
    }

    if (key.name === 'return') {
        const command = input.trim();
        input = ''
        if (command) {
            await doCommand(command.split(/\s+/));
        }
        if (!tasks.length) {
            process.stdout.write('\r\x1b[2K> ' + input);
        }
        return;
    }

    if (key.name === 'backspace') {
        input = input.slice(0, -1)
    } else if (char && !key.ctrl && !key.meta) {
        input += char
    }

    process.stdout.write('\r\x1b[2K> ' + input)
});

let barLength = 30

function main() {
    console.clear();
    let types = [];
    for (let task of tasks) {
        types.push(task.task);
    }

    for (let type of types) {
        let tasksOfType = tasks.filter(t => t.task === type);
        if (tasksOfType.length && tasksOfType.every(t => t.finished)) {
            for (let task of tasksOfType) task.remove();
        }
    }

    types = [...new Set(types)];
    for (let type of types.sort()) {
        let tasksOfType = tasks.filter(t => t.task === type);
        const remaining = tasksOfType.filter(t => !t.finished).length;
        const failed = tasksOfType.filter(t => t.finished && t.success === false).length;
        const successful = tasksOfType.filter(t => t.finished && t.success).length;
        const finished = tasksOfType.filter(t => t.finished).length;
        console.log(`${type}: ${finished}/${tasksOfType.length}\n└─ [${bar(successful / tasksOfType.length * barLength, '1;92')}${bar(failed / tasksOfType.length * barLength, '1;91')}${bar(remaining / tasksOfType.length * barLength, 0)}]\n`);
    }

    process.stdout.write('\r\x1b[2K> ' + input)
}

setInterval(() => {
    if (tasks.length) {
        main();
    }
}, 100);
//# sourceMappingURL=app.js.map