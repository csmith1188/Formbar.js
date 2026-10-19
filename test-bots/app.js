import Bot from "./bot.js";
process.stdin.setEncoding('utf8');
export const FORMBAR_URL = 'https://formbarapi.yorktechapps.com';
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

}

function removeTasksOfType(type) {
    const tasksToRemove = tasks.filter(task => task.task === type && !task.removeScheduled);
    if (!tasksToRemove.length || !tasksToRemove.every(task => task.finished)) {
        return;
    }

    for (const task of tasksToRemove) {
        task.removeScheduled = true;
    }

    setTimeout(() => {
        tasks = tasks.filter(task => !tasksToRemove.includes(task));
        main();
    }, 2000);
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

    if (terms[0] == 'cls' || terms[0] == 'clear') {
        lastRender = '';
    }

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
    }
}

async function enroll(amount, code) {
    amount = Math.min(amount, bots.length);
    for (let i = 0; i < amount; i++) {
        bots[i].enroll(code);
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
let previousInputs = ['']
let previousSelector = 0
console.clear()
process.stdout.write('\r\x1b[2K> ' + input)

process.stdin.on('keypress', async (char, key) => {
    if (key.ctrl && key.name === 'c') {
        process.exit()
    }

    if (key.name === 'return') {
        previousInputs.push(input)
        previousSelector = previousInputs.length
        const command = input.trim();
        input = ''
        if (command) {
            await doCommand(command.split(/\s+/));
        }
        main();
        return;
    }

    if (key.name === 'up') {
        previousSelector--
        previousSelector = Math.max(previousSelector, 0)
        input = previousInputs[previousSelector]
        main()
        return
    }

    if (key.name === 'down') {
        previousSelector++
        previousSelector = Math.min(previousSelector, previousInputs.length - 1)
        input = previousInputs[previousSelector]
        main()
        return
    }

    if (key.name === 'backspace') {
        input = input.slice(0, -1)
    } else if (char && !key.ctrl && !key.meta) {
        input += char
    }

    main()
});

let barLength = 30
let lastRender = ''

function main() {
    let types = [];
    for (let task of tasks) {
        types.push(task.task);
    }

    for (let type of types) {
        let tasksOfType = tasks.filter(t => t.task === type);
        if (tasksOfType.length && tasksOfType.every(t => t.finished)) {
            removeTasksOfType(type);
        }
    }

    types = [...new Set(types)];
    let render = '';
    for (let type of types.sort()) {
        let tasksOfType = tasks.filter(t => t.task === type);
        const remaining = tasksOfType.filter(t => !t.finished).length;
        const failed = tasksOfType.filter(t => t.finished && t.success === false).length;
        const successful = tasksOfType.filter(t => t.finished && t.success).length;
        const finished = tasksOfType.filter(t => t.finished).length;
        render += `${type}: ${finished}/${tasksOfType.length}\n└─ [${bar(successful / tasksOfType.length * barLength, '1;92')}${bar(failed / tasksOfType.length * barLength, '1;91')}${bar(remaining / tasksOfType.length * barLength, 0)}]\n\n`;
    }

    render += '\x1b[2K> ' + input;
    if (render === lastRender) {
        return;
    }
    lastRender = render;
    const clearedRender = render
        .split('\n')
        .map(line => '\x1b[2K' + line)
        .join('\n');
    process.stdout.write('\x1b[H' + clearedRender + '\x1b[J');
}

setInterval(() => {
    if (tasks.length) {
        main();
    }
}, 100);
//# sourceMappingURL=app.js.map