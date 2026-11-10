**Note:** Before doing this, you either need your own Formbar server running, or you need a public instance of Formbar that you can use.

# Overview
This page details how external apps can interact with Formbar through the WebSocket API. This allows apps to receive live class updates, start and answer polls, react to help/break changes, and perform classroom actions without polling HTTP endpoints.

Formbar uses Socket.IO. Socket authentication is handled at connection time with one of these methods:

- `api` header: a user API key.
- `authorization` header: a bearer access token from `/api/v1/auth/login`, `/api/v1/auth/refresh`, or OAuth.
- Existing browser session cookie: for Formbar's own web client.

# Usage in NodeJS

## Add socket.io-client library
```bash
npm i socket.io-client
```
```JS
const { io } = require('socket.io-client');
```

## Set up Formbar URL and credentials
Set the address for the Formbar.js instance you wish to connect to. Use either an API key or a bearer access token.

```JS
const FORMBAR_URL = 'http://localhost:420'; // Example local server
const API_KEY = 'get your own API key and put it here';
```

You can regenerate your API key with `POST /api/v1/user/{id}/api/regenerate`, or from the Formbar profile UI when available. API keys are sent in the lowercase `api` socket header.

## Prepare socket for API calls
```JS
const socket = io(FORMBAR_URL, {
    extraHeaders: {
        api: API_KEY
    }
});
```

For bearer-token auth:

```JS
const socket = io(FORMBAR_URL, {
    extraHeaders: {
        authorization: `Bearer ${accessToken}`
    }
});
```

## Connect to Formbar
The server emits `setClass` after successful socket authentication. This value is the active class ID or `null`.

```JS
socket.on('connect', () => {
    console.log('Connected');
});

socket.on('setClass', (classId) => {
    console.log('Active class:', classId);
});

socket.on('error', (error) => {
    // Most current socket errors are objects: { message, event }
    console.error(error);
});
```

## Joining a class
Use `joinClass` when the user is already enrolled in the class. Use `joinRoom` with a class code when enrolling for the first time. Guests must use `joinRoom`.

```JS
const classId = 1;
const classCode = 'vmnt';

socket.emit('joinClass', classId);

socket.on('joinClass', (response) => {
    if (response === true || response?.success) {
        console.log('Joined class');
        socket.emit('classUpdate');
        return;
    }

    console.log('Could not join by id, trying class code:', response);
    socket.emit('joinRoom', classCode);
});
```

After requesting or receiving an update:

```JS
socket.on('classUpdate', (classroomData) => {
    console.log(classroomData);
});
```

## Starting and answering polls

The current `startPoll` API accepts a single object. Legacy multi-argument calls still work, but new code should prefer the object form.

```JS
socket.emit('startPoll', {
    prompt: 'Which topics need more practice?',
    answers: [
        { answer: 'Callbacks', weight: 1, color: '#ff6b6b' },
        { answer: 'Promises', weight: 1, color: '#4dabf7' },
        { answer: 'Async/await', weight: 1, color: '#51cf66' }
    ],
    blind: false,
    weight: 1,
    tags: [],
    excludedRespondents: [],
    indeterminate: [],
    allowVoteChanges: true,
    allowTextResponses: true,
    allowMultipleResponses: true
});

socket.on('startPoll', () => {
    console.log('Poll started');
});
```

Students answer with `pollResp`. Send a string for single-answer polls, an array for multi-answer polls, and `"remove"` or an empty array to clear a response.

```JS
// Single response
socket.emit('pollResp', 'Promises');

// Multiple responses with optional text
socket.emit('pollResp', ['Promises', 'Async/await'], 'I need more examples.');

// Remove a response
socket.emit('pollResp', 'remove');
```

## Updating and clearing polls

```JS
// End and save the active poll to history
socket.emit('updatePoll', { status: false });

// Change who can vote
socket.emit('updatePoll', { excludedRespondents: [12, 18, 21] });

// Clear the poll from the class
socket.emit('updatePoll', {});
```

## Socket connection errors

```JS
socket.on('connect_error', (error) => {
    console.log('Socket connection error:', error.message);

    setTimeout(() => {
        socket.connect();
    }, 5000);
});
```

# Usage in Python

**IMPORTANT:** When sending multiple Socket.IO arguments from Python, send them as a tuple. Boolean values are supported by current Python Socket.IO clients, but if you are working with older clients and see booleans arrive incorrectly, use `1` and `0`.

## Add python-socketio[client] library
```py
pip install "python-socketio[client]"
```
```py
import socketio
```

## Set up Formbar URL and credentials
```py
FORMBAR_URL = 'http://localhost:420'
API_KEY = 'get your own API key and put it here'
```

## Connect to Formbar
```py
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print('Connected to Formbar')
    sio.emit('classUpdate')

@sio.on('setClass')
def on_set_class(class_id):
    print(f'Active class: {class_id}')

@sio.on('classUpdate')
def on_class_update(data):
    print(data)

sio.connect(FORMBAR_URL, headers={'api': API_KEY})
sio.wait()
```

## Starting a poll in Python
```py
sio.emit('startPoll', {
    'prompt': 'Ready to move on?',
    'answers': [
        {'answer': 'Yes', 'weight': 1, 'color': '#51cf66'},
        {'answer': 'No', 'weight': 1, 'color': '#ff6b6b'}
    ],
    'blind': False,
    'weight': 1,
    'tags': [],
    'excludedRespondents': [],
    'indeterminate': [],
    'allowVoteChanges': True,
    'allowTextResponses': False,
    'allowMultipleResponses': False
})
```

If you must call the legacy argument form from Python, put the arguments in a tuple:

```py
sio.emit('startPoll', ("1", False, "Ready?", [{"answer": "Yes", "weight": 1, "color": "#51cf66"}], False, 1, [], [], [], [], False, True))
```

# Socket Documentation

## Permissions

Formbar now uses scopes internally. The classic permission levels still exist as a rough shorthand, but socket handlers enforce scopes such as `class.poll.create` or `global.digipogs.transfer`.

| Classic Role | Level | Typical Scope Coverage |
|--------------|-------|------------------------|
| Manager | 5 | Global system/user management plus all class scopes |
| Teacher | 4 | Class creation/deletion, session control, student management, timer and digipog awards |
| Mod | 3 | Poll creation/sharing/deletion, help/break approval, links/tags |
| Student | 2 | Poll voting, help and break requests, pools, digipog transfers |
| Guest | 1 | Limited class participation after enrollment/session join |
| Banned | 0 | Blocked |

## Common payloads

### PollOptions
```typescript
PollOptions: {
    answer: string,
    weight?: number,   // Clamped to 1..5 by the server
    color?: string,    // Hex color
    correct?: boolean
}
```

### StartPollData
```typescript
StartPollData: {
    prompt: string,
    answers: PollOptions[],
    blind?: boolean,
    allowVoteChanges?: boolean,
    weight?: number,
    tags?: string[],
    excludedRespondents?: number[],
    indeterminate?: string[],
    allowTextResponses?: boolean,
    allowMultipleResponses?: boolean
}
```

### ClassUpdate
Students receive a restricted, personalized class update. Control-panel users receive a richer payload.

```typescript
ClassUpdate: {
    id: number,
    className: string,
    isActive: boolean,
    owner: number,
    timer: {
        startTime?: number,
        endTime?: number,
        active: boolean,
        sound?: boolean,
        pausedAt?: number
    },
    poll: {
        status: boolean,
        responses: PollOptions[],
        prompt: string,
        weight: number,
        blind: boolean,
        excludedRespondents?: number[],
        allowVoteChanges?: boolean,
        allowTextResponses?: boolean,
        allowMultipleResponses?: boolean,
        totalResponses?: number,
        totalResponders?: number
    },
    settings: object,
    myId?: number,
    myTags?: string[],
    myRoles?: object[],
    permissions?: object,
    key?: string,
    tags?: string[],
    roles?: object[],
    students?: {
        [userId: number]: {
            id: number,
            displayName: string,
            activeClass: number | null,
            roles: object,
            tags: string[],
            pollRes: object,
            help: object | boolean | null,
            break: string | boolean | null,
            pogMeter: number,
            isGuest: boolean
        }
    }
}
```

### CustomPollData
`customPollUpdate` sends four arguments rather than one object.

```typescript
customPollUpdate(
    publicPolls: number[],
    classroomPolls: number[],
    userCustomPolls: number[],
    customPollsData: {
        [pollId: number]: {
            id: number,
            owner: number,
            name: string,
            prompt: string,
            answers: PollOptions[],
            textRes: boolean,
            blind: boolean,
            allowVoteChanges: boolean,
            allowMultipleResponses: boolean,
            weight: number,
            public: boolean
        }
    }
)
```

## Sending events

These are events that you can send through `socket.emit()`.

### Class Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `startClass` | _None_ | `class.session.start` | Starts the active class session. |
| `endClass` | _None_ | `class.session.end` | Ends the active class session. |
| `joinClass` | `classIdOrKey: number \| string` | Authenticated/enrolled user | Joins a loaded class session. The user must already be enrolled unless they own the class. |
| `joinRoom` | `classCode: string` | Authenticated user | Enrolls in a classroom by code and joins it. Guests must use this event. |
| `leaveClass` | _None_ | Authenticated user | Leaves the active class session but keeps classroom membership. Guests are removed from the classroom. |
| `leaveRoom` | _None_ | Authenticated user | Permanently unenrolls from the current classroom. |
| `getActiveClass` | _None_ | API socket | Re-syncs API sockets with the user's active class and emits `setClass`. Legacy form `getActiveClass(apiKey)` is deprecated. |
| `isClassActive` | _None_ | `class.session.settings` | Returns the current active state on `isClassActive`. |
| `setClassSetting` | `setting: string, value: any` or `settings: object` | `class.session.settings` | Updates class settings and broadcasts `classUpdate`. |
| `regenerateClassCode` | _None_ | `class.session.regenerate_code` | Regenerates the class access code and emits `reload` to the caller. |
| `changeClassName` | `name: string` | `class.session.rename` | Changes the class name and confirms on `changeClassName`. |
| `deleteClass` | `classId: number` | `global.class.delete` | Deletes an owned/managed classroom and refreshes owned classes. |
| `classKickStudent` | `email: string` | `class.students.kick` | Removes a student from the classroom and session. |
| `classRemoveFromSession` | `userId: number` | `class.students.kick` | Removes a student from the current session without unenrolling them. |
| `classKickStudents` | _None_ | `class.students.kick` | Removes all students from the current session. |
| `classBanUser` | `email: string` | `class.students.ban` | Applies the class blocked role to a user. |
| `classUnbanUser` | `email: string` | `class.students.ban` | Removes the class blocked role from a user. |
| `updateExcludedRespondents` | `respondents: number[]` | `class.students.read` | Updates poll exclusions and also excludes offline, on-break, and `Excluded` tagged students. |

### User Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `getOwnedClasses` | `email: string` | `global.class.create` | Retrieves classes owned by a user and returns them on `getOwnedClasses`. |
| `logout` | _None_ | Authenticated user | Logs the current socket/session out. |

### Poll Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `startPoll` | `poll: StartPollData` or legacy positional args | `class.poll.create` | Starts a poll in the current class. The class must be active. |
| `updatePoll` | `options: object` | `class.poll.create` | Updates current poll fields. `{ status: false }` ends/saves, `{}` clears. |
| `pollResp` | `response: string \| string[]`, `textResponse?: string` | `class.poll.vote` | Responds to the active poll. Use arrays for multi-response polls. |
| `classPoll` | `poll: object` | `class.poll.create` | Saves a new custom poll and emits `classPollSave` with the new ID. |
| `savePoll` | `poll: object`, `pollId?: number` | `class.poll.create` | Creates or updates a custom poll. Updates require ownership. |
| `deletePoll` | `pollId: number` | `class.poll.delete` | Deletes a custom poll owned by the current user. |
| `setPublicPoll` | `pollId: number`, `value: boolean` | `class.poll.share` | Marks a custom poll public/private and refreshes custom poll data. |
| `sharePollToUser` | `pollId: number`, `email: string` | `class.poll.share` | Shares a custom poll with a user. |
| `removeUserPollShare` | `pollId: number`, `userId: number` | `class.poll.share` | Removes a user poll share. |
| `getPollShareIds` | `pollId: number` | `class.poll.share` | Returns user/class share rows on `getPollShareIds`. |
| `sharePollToClass` | `pollId: number`, `classId: number` | `class.poll.share` | Shares a custom poll with a class. |
| `removeClassPollShare` | `pollId: number`, `classId: number` | `class.poll.share` | Removes a class poll share. |

### Help Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `help` | `reason: string` | `class.help.request` | Sends or updates the current user's help ticket. |
| `deleteTicket` | `studentId: number` | `class.help.approve` | Deletes a student's help ticket. |

### Break Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `requestBreak` | `reason: string` | `class.break.request` | Sends a break request. |
| `endBreak` | _None_ | `class.break.request` | Ends the current user's break. |
| `approveBreak` | `breakApproval: boolean`, `userId: number` | `class.break.approve` | Approves or denies a student's break request. |

### Tag Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `setTags` | `tags: string[]` | `class.tags.manage` | Updates the class tag list. |
| `saveTags` | `studentId: number`, `tags: string[]` | `class.tags.manage` | Saves tags for a specific student. |

### Update Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `classUpdate` | _None_ | Authenticated class user | Requests current classroom data for the caller. |
| `customPollUpdate` | _None_ | `class.poll.create` | Requests latest custom poll data for the user. |
| `classBannedUsersUpdate` | _None_ | `class.students.ban` | Requests the banned-user ID list for the current class. |
| `getClassroom` | _None_ | Legacy authenticated user | Deprecated alias for an explicit `classUpdate` pull. |

### Digipog Sockets

| Event Name | Parameters | Required Scope | Description |
|------------|------------|----------------|-------------|
| `awardDigipogs` | `awardData: { from?: number, to: number, amount: number, reason?: string }` | `class.digipogs.award` | Awards digipogs to a user. |
| `transferDigipogs` | `transferData: { from: number \| object, to: number, amount: number, reason?: string, pin: string \| number, pool?: boolean }` | `global.digipogs.transfer` | Transfers digipogs between users or to a pool. |

### Legacy Authentication Sockets

| Event Name | Parameters | Status | Description |
|------------|------------|--------|-------------|
| `getActiveClass` | `apiKey: string` | Deprecated | Legacy API-key auth. Prefer `api` connection header. |
| `auth` | `{ token: string }` | Deprecated | Legacy JWT auth. Prefer `authorization` connection header. |

## Receiving events

These are sockets that you can listen to through `socket.on()`.

### Class Sockets

| Event Name | Parameters | Description |
|------------|------------|-------------|
| `setClass` | `classId: number \| null` | Sent after socket auth and whenever active class changes. |
| `joinClass` | `true` or `{ success: boolean, roomId?: number }` | Response after class join/enrollment. Errors arrive on `error`. |
| `isClassActive` | `isActive: boolean` | Response to `isClassActive` and broadcast when class starts/ends. |
| `changeClassName` | `name: string` | Confirms a class name change. |
| `reload` | _None_ | Tells the client to reload, commonly after class code regeneration or unenrollment. |
| `break` | `breakApproval: boolean` | Sent to a student/API socket when a break is approved/ended. |

### User Sockets

| Event Name | Parameters | Description |
|------------|------------|-------------|
| `getOwnedClasses` | `{ name: string, id: number }[]` | Classes owned by the requested user. |

### Poll Sockets

| Event Name | Parameters | Description |
|------------|------------|-------------|
| `startPoll` | _None_ | Confirms that the poll was started by the caller. |
| `classPollSave` | `pollId: number` | New custom poll ID after `classPoll`. |
| `getPollShareIds` | `userPollShares: { pollId: number, userId: number }[]`, `classPollShares: { pollId: number, classId: number, name: string }[]` | Share rows for a custom poll. |

### Update Sockets

| Event Name | Parameters | Description |
|------------|------------|-------------|
| `classUpdate` | `classroomData: ClassUpdate` | Current classroom snapshot. Teacher/control-panel users receive student and class management fields; students receive a restricted personalized snapshot. |
| `customPollUpdate` | `publicPolls, classroomPolls, userCustomPolls, customPollsData` | Custom poll access data for the user. |
| `classBannedUsersUpdate` | `bannedUserIds: number[]` | Class-banned user IDs. |
| `managerUpdate` | `users: object[]`, `classrooms: object[]` | Manager dashboard data for manager sockets. |

### Digipog Sockets

| Event Name | Parameters | Description |
|------------|------------|-------------|
| `awardDigipogsResponse` | `{ success: boolean, message?: string, ... }` | Result after awarding digipogs. |
| `transferResponse` | `{ success: boolean, message: string, ... }` | Result after transferring digipogs. |

### Sound Events

These events are emitted to play sounds on the client.

| Event Name | Parameters | Description |
|------------|------------|-------------|
| `joinSound` | _None_ | Student joined the class. |
| `leaveSound` | _None_ | Student left, was kicked, or was unenrolled. |
| `kickStudentsSound` | _None_ | All students were kicked from the class session. |
| `helpSound` | _None_ | Student sent a help ticket. |
| `breakSound` | _None_ | Student requested a break. |
| `startClassSound` | _None_ | Class session started. |
| `endClassSound` | _None_ | Class session ended. |
| `pollSound` | _None_ | Poll response was added/changed. |
| `removePollSound` | _None_ | Poll response was removed. |

### General Events

| Event Name | Parameters | Description |
|------------|------------|-------------|
| `message` | `message: string` | Human-readable success/warning message. |
| `error` | `{ message: string, event: string }` or legacy string | Error response. Current handlers generally use an object. |
| `deprecationWarning` | `{ message: string, event: string, recommendation: string }` | Sent after deprecated auth event usage. |

# Examples

## Teacher: start class, create poll, then end poll

```JS
socket.emit('startClass');

socket.emit('startPoll', {
    prompt: 'What should we review first?',
    answers: [
        { answer: 'Loops', weight: 1, color: '#ffd43b' },
        { answer: 'Functions', weight: 1, color: '#74c0fc' },
        { answer: 'Objects', weight: 1, color: '#b197fc' }
    ],
    allowVoteChanges: true,
    allowTextResponses: false,
    allowMultipleResponses: false
});

socket.on('classUpdate', (classroom) => {
    console.log(classroom.poll.totalResponses, 'responses so far');
});

// Later
socket.emit('updatePoll', { status: false });
```

## Student: join by code and answer with text

```JS
socket.emit('joinRoom', 'vmnt');

socket.on('joinClass', (response) => {
    if (response?.success) {
        socket.emit('classUpdate');
    }
});

socket.on('classUpdate', (classroom) => {
    if (classroom.poll?.status) {
        socket.emit('pollResp', 'Functions', 'I also want recursion practice.');
    }
});
```

## Mod/teacher: help and break workflow

```JS
socket.on('classUpdate', (classroom) => {
    for (const student of Object.values(classroom.students || {})) {
        if (student.help) {
            console.log(`${student.displayName} needs help`, student.help);
        }

        if (typeof student.break === 'string') {
            socket.emit('approveBreak', true, student.id);
        }
    }
});

socket.emit('deleteTicket', 42);
```

## Custom poll sharing

```JS
socket.emit('savePoll', {
    name: 'Exit Ticket',
    prompt: 'How confident are you?',
    answers: [
        { answer: '1', weight: 1, color: '#ff8787' },
        { answer: '2', weight: 1, color: '#ffd43b' },
        { answer: '3', weight: 1, color: '#69db7c' }
    ],
    textRes: true,
    blind: true,
    allowVoteChanges: true,
    allowMultipleResponses: false,
    weight: 1,
    public: false
});

socket.emit('sharePollToUser', 12, 'student@example.com');
socket.emit('sharePollToClass', 12, 3);
socket.emit('getPollShareIds', 12);
```

## Digipog transfer

```JS
socket.emit('transferDigipogs', {
    from: 1,
    to: 2,
    amount: 25,
    reason: 'Study group reward',
    pin: '1234',
    pool: false
});

socket.on('transferResponse', (result) => {
    console.log(result.success, result.message);
});
```