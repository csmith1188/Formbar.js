# Usage in Python

**IMPORTANT:** When sending websocket requests to Formbar, there are a few differences from the NodeJS way of making requests due to different implementations of SocketIO. When sending multiple arguments to Formbar, you will want to send them as a tuple. Additionally, True or False in Python will be converted to strings. In order to get around this, you will want to send them as numbers. True = 1 and False = 0.

## Sending multiple arguments example with starting polls
```py
# The data sent is within a tuple: ()
sio.emit('startPoll', ("1", False, "", [{"answer":"A","weight":1,"color":"#ff0000"}], {}, 1, [], [], [], [], False))
```


## Add python-socketio[client] library
```py
pip install "python-socketio[client]"
```
```py
import socketio
```

## Set up Formbar URL and API key
```py
# Set your FormbarJS URL and API key
FORMBAR_URL = 'http://172.16.3.159:420'
API_KEY = 'get your own api key and put it here'
```

## Prepare socket for API calls
Set the Formbar URL and API key with this. This will attempt to connect to Formbar and authenticate with the API key provided.
```py
sio = socketio.Client()
```

## Connect to the Formbar
To detect when you're connected, listen to the 'connect' event. From here, you can begin emitting and listening to various events.
```py
@sio.event
def connect():
    print('Connected to Formbar')
    sio.emit('getActiveClass')

@sio.on('setClass')
def on_set_class(new_class_id):
    print(f'The user is currently in the class with id {new_class_id}')

sio.connect(FORMBAR_URL, headers={'api': API_KEY})
sio.wait()
```
From here, usage in Python is very much the same as NodeJS. Just remember to send True/False values as numbers and to use tuples as shown at the beginning when sending multiple arguments to Formbar.

# Usage in NodeJS

## Add socket.io-client library
```bash
npm i socket.io-client
```
```JS
const { io } = require('socket.io-client');
```

## Set up Formbar URL and API key
Set the address for the FormbarJS instance you wish to connect to, and your API Key...
```JS
const FORMBAR_URL = 'http://172.16.3.159:420/';
const API_KEY = 'get ur own api key and put it here';
```
You can get your API key by logging into the instance of FormbarJS you wish to interact with and going to `/apikey`.

## Prepare socket for API calls
Set the Formbar URL and API key with this. This will attempt to connect to Formbar and authenticate with the API key provided.
```JS
const socket = io(FORMBAR_URL, {
    extraHeaders: {
        api: API_KEY
    }
});
```

## Connect to the Formbar
To detect when you're connected, listen to the 'connect' event. From here, you can begin emitting and listening to various events.
```JS
socket.on('connect', () => {
    console.log('Connected');
    socket.emit('getActiveClass');
});

socket.on('setClass', (newClassId) => {
    console.log(`The user is currently in the class with id ${newClassId}`);
});
```

## Making a request
Firstly, we're going to emit an event to join a class session. This requires the user to be in the classroom before making the request. To join a classroom for the first time, you would use the `joinClassroom` event with a class code instead.<br>
NOTE: The `joinClass` or `joinClassroom` socket events will not work on teacher accounts.
```JS
let classId = 1; // Class Id here
let classCode = 'vmnt' // If you're not already in the classroom, you can join it by using the class code.
socket.emit('joinClass', classId);
socket.on('joinClass', (response) => {
    // If joining the class is successful, it will return true.
    if (response == true) {
        console.log('Successfully joined class')
        socket.emit('vbUpdate')
    } else {
        // If not, try to join the classroom with the class code.
	socket.emit('joinClassroom', classCode);
	console.log('Failed to join class: ' + response)
    }
});
```

After requesting data by emitting `vbUpdate`, you can listen for the data like this. This is the same way the `joinClass` event works above.<br>
The code below will log the virtual bar data.
```JS
socket.on('vbUpdate', (data) => {
    console.log(data);
});
```

## Sending poll responses

This is how you can send a poll response when there's an active poll in the classroom. Below shows answering a true or false poll. If there's a text option in the poll, then you can use a third argument in order to send a text response.
```JS
// True or false 
socket.emit('pollResp', 'True')

// Text response
socket.emit('pollResp', '', 'Text response here')
```

This will check if there is a connection error and attempt to reconnect in 5 seconds.
```JS
socket.on('connect_error', (error) => {
	/*
		"xhr poll error" is just the error it give when it can't connect,
		which is usually when the Formbar is not on or you are not on the same network.
	*/
	if (error.message == 'xhr poll error') {
            console.log('no connection');
	else {
            console.log(error.message);
        }      

	setTimeout(() => {
		socket.connect();
	}, 5000);
});
```

# Socket Documentation

## Sending events

These are events that you can send through `socket.emit()`.

### Class Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|-------------|-------------|
| `startClass` | _None_ | Teacher Permissions | Starts the class the user is currently in. |
| `endClass` | _None_ | Teacher Permissions | Ends the class the the user is currently in. |
| `joinClass` | classId: Number | Guest Permissions | Joins a class session. |
| `joinClassroom` | classCode: String | Guest Permissions | Joins a classroom. |
| `leaveClass` | _None_ | Guest Permissions | Leaves the class session that the user is currently in. This will not completely remove the user from the classroom. |
| `leaveClassroom` | _None_ | Guest Permissions | Leaves the classroom the user is currently in. This will completely remove the user from the classroom. |
| `getActiveClass` | _None_ | Guest Permissions | Retrieves the class the user is currently in. |
| `isClassActive` | _None_ | Teacher Permissions | Gets whether the class the user is in is active. |
| `doStep` | Index: Number | Mod Permissions | Begins the step in the classroom at the index specified. Example: Creating a poll or lesson. |

### User Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `getOwnedClasses` | username: String | Teacher Permissions | Retrieves the classes that the user owns and returns them on the same event. |
| `deleteUser` | userId: Number | Manager Permissions | Deletes a user from Formbar. |
| `logout` | _None_ | Guest Permissions | Logs the current user out. |

### Poll Sockets

#### Structures
These are custom types used in the sockets below.

#### Poll
```typescript
Poll: {
    status: Boolean,         // Whether poll is active
    responses: Object,       // Response data for each option
    textRes: Boolean,        // Whether text responses are enabled
    prompt: String,          // The poll question/prompt
    weight: Number,          // Poll weight value
    blind: Boolean,          // Whether responses are hidden
    requiredTags: String[],  // Required tags for responding
    studentBoxes: String[],  // Student selection boxes
    lastResponse: Array,     // Previous response data
    allowedResponses: Array, // Permitted response options
    multiRes: Boolean        // Whether multiple responses are allowed
}
```

#### PollOptions
```typescript
PollOptions: {
    answer: String,   // The answer text
    weight: Number,   // The weight of the answer
    color: String     // The color of the answer in hex
}
```

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `startPoll` | responseNumber: Number<br> responseTextBox: Number<br> pollPrompt: String<br> polls: PollOptions[]<br> blind: Boolean<br> weight: Number<br> tags: String[]<br> boxes: String[]<br> indeterminate: String[]<br> lastResponse: any[]<br> multiRes: Boolean | Teacher Permissions | Starts a poll in the current class. |
| `endPoll` | None | Teacher Permissions | Clears the poll in the current class. |
| `clearPoll` | None | Teacher Permissions | Clears the poll in the current class. |
| `pollResp` | response: String<br> textResponse: String | Student Permissions | Responds to a poll in the current class. |
| `savePoll` | poll: Poll<br> pollId: Number | Teacher Permissions | Saves a custom poll to the database. |
| `setPublicPoll` | pollId: Number<br> value: Boolean | Mod Permissions | Sets a custom poll to be public. |
| `previousPollDisplay` | pollIndex: Number | Teacher Permissions | Requests a previous poll by its index and returns it on the same event. |
| `sharePollToUser` | pollId: Number<br> username: String | Mod Permissions | Shares a custom poll with another user. |
| `removeUserPollShare` | pollId: Number<br> userId: Number| Mod Permissions | Unshares a custom poll from another user. |
| `removeClassPollShare` | pollId: Number<br> classId: Number | Mod Permissions | Unshares a custom poll from an entire class.
| `getPollShareIds` | pollId: Number | Mod Permissions | Requests the ids of shared polls. |
| `sharePollToClass` | pollId: Number<br> classId: Number | Mod Permissions | Shares a custom poll with the entire class. |

### Help Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `help` | reason: String | Guest Permissions | Sends a help ticket with a reason. |
| `deleteTicket` | username: String | Mod Permissions | Deletes a student's help ticket. |

### Break Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `requestBreak` | reason: String | Student Permissions | Requests a break with a reason in the current class. |
| `endBreak` | _None_ | Student Permissions | Ends the current student's break. |
| `approveBreak` | isApproved: Boolean<br> username: String | Mod Permissions | Approves a student's break request. |

### Plugin Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `addPlugin` | name: String<br> url: String | Teacher Permissions | Adds a plugin to the database. |
| `removePlugin` | pluginId: Number | Teacher Permissions | Removes a plugin from the database. |
| `changePlugin` | pluginId: Number<br> name: String<br> url: String | Teacher Permissions | Modifies a plugin in the database. |

### Tag Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `newTag` | tagName: String | Teacher Permissions | Adds a tag to the database for the class. |
| `removeTag` | tagName: String | Teacher Permissions | Removes a tag from the database for the class. |
| `saveTags` | studentId: Number<br> tags: String[]<br> username: String | Teacher Permissions | Saves a tag to a user in the class. |

### Timer Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `vbTimer` | _None_ | Guest Permissions | Asks for the timer data for the virtual bar. |
| `timer` | startTime: Number<br> active: Boolean<br> sound: Boolean | Teacher Permissions | Starts a timer. |
| `timerOn` | _None_ | Teacher Permissions | Gets whether there is an active timer. |

### Update Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `pollUpdate` | _None_ | Student Permissions | Sends the current class poll to the rest of the class. |
| `modeUpdate` | _None_ | Student Permissions | Sends the current class mode to the rest of the class. |
| `quizUpdate` | _None_ | Student Permissions | Sends the current class quiz to the rest of the class. NOTE: This is currently non-functional. |
| `lessonUpdate` | _None_ | Student Permissions | Sends the current class lesson to the rest of the class. NOTE: This is currently non-functional. |
| `vbUpdate` | _None_ | Guest Permissions | Updates the virtual bar and sends the information to the rest of the class. |
| `customPollUpdate` | _None_ | Mod Permissions | Sends the custom polls to the selected user. |
| `pluginUpdate` | _None_ | Student Permissions | Sends the current plugins in the class to the rest of the class. |
| `cpUpdate` | _None_ | Mod Permissions | Sends the current class permissions to the rest of the class. |
| `classBannedUsersUpdate` | _None_ | Teacher Permissions | Sends the current banned users to the rest of the class. |
| `managerUpdate` | _None_ | Manager Permissions | Retrieves all the information needed for managers. |
| `modeChange` | mode: String | Teacher Permissions | Changes the mode that the class is currently in. |
| `ipUpdate` | _None_ | Manager Permissions | Updates the whitelist and blacklist list for ips. |

### IP Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `addIp` | type: String ("whitelist" or "blacklist")<br> ip: String | Manager Permissions | Adds an IP to the whitelist or blacklist. |
| `removeIp` | type: String ("whitelist" or "blacklist")<br> id: Number | Manager Permissions | Removes an IP from the whitelist or blacklist. |
| `changeIp` | type: String ("whitelist" or "blacklist")<br> id: Number<br> ip: String | Manager Permissions | Changes an IP on the whitelist or blacklist list. |
| `toggleIpList` | type: String ("whitelist" or "blacklist") | Manager Permissions | Toggles the IP list between whitelist and blacklist. |

## Receiving events

These are sockets that you can listen to through `socket.on()`.

### Class Sockets

| Event Name | Parameters | Permissions | Description |
|------------|------------|-------------|-------------|
| `joinClass` | result: Boolean | String (This will be a string if it errors) | Guest Permissions | Sends the result of a joinClass event. |
| `joinClassroom` | result: Boolean | String (This will be a string if it errors) | Guest Permissions | Sends the result of a joinClassroom event. |
| `setClass` | classId: Number | Guest Permissions | Retrieves the current class ID the user is active in. This gets sent after emitting `getActiveClass` as well as any time the user joins a class session. |

### User Sockets

#### Structures
These are custom types used in the sockets below.

#### OwnedClass
```typescript
OwnedClass: {
    name: String,    // Name of the classroom
    id: Number,      // Unique identifier of the classroom
}
```

| Event Name | Parameters | Permissions | Description |
|------------|------------|-------------|-------------|
| `getOwnedClasses` | ownedClasses: OwnedClass[] | Teacher Permissions | Retrieves the result of the `getOwnedClasses` event. |

### Poll Sockets

#### Structures
These are custom types used in the sockets below.

#### UserPollShares
```typescript
UserPollShares: {
    pollId: Number,   // The ID of the poll
    userId: Number,   // The ID of the user
    username: String  // The username of the user
}
```

#### ClassPollShares
```typescript
ClassPollShares: {
    pollId: Number,   // The ID of the poll
    classId: Number,  // The ID of the class
    name: String      // The name of the class
}
```

#### PreviousPoll
```typescript
PreviousPoll: {
    id: Number,             // Poll ID
    class: Number,          // Class ID
    date: String,           // Date of the poll in format "M/D/YYYY"
    data: {
        prompt: String,     // Poll question/prompt
        names: String[],    // Array of student names who responded
        letter: String[],   // Array of button responses
        text: String[].     // Array of text responses
    };
}
```

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `startPoll` | _None_ | Guest Permissions | Alerts the client that a poll has started. |
| `previousPollDisplay` | previousPoll: PreviousPoll | Teacher Permissions | Returns the requested previous poll. |
| `getPollShareIds` | userPollShares: UserPollShares[]<br> classPollShares: ClassPollShares[] | Mod Permissions | Returns the requested shared poll ids. |

### Timer Sockets

#### Structures
These are custom types used in the sockets below.

#### TimeData
```typescript
TimeData: {
    timeLeft: Number,    // Seconds remaining on timer
    startTime: Number,   // Initial timer duration in seconds
    sound: Boolean,      // Whether sound should play when timer ends
    active: Boolean      // Whether timer is currently running
}
```

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `vbTimer` | newTimeData: TimeData | Guest Permissions | Retrieves the current timer data for the virtual bar. |
| `timerOn` | time: Boolean | Teacher Permissions | Returns whether or not there is an active timer. |

### Update Sockets

#### Structures
These are custom types used in the sockets below.

#### Poll
```typescript
Poll: {
    status: Boolean,         // Whether poll is active
    responses: Object,       // Response data for each option
    textRes: Boolean,        // Whether text responses are enabled
    prompt: String,          // The poll question/prompt
    weight: Number,          // Poll weight value
    blind: Boolean,          // Whether responses are hidden
    requiredTags: String[],  // Required tags for responding
    studentBoxes: String[],  // Student selection boxes
    lastResponse: Array,     // Previous response data
    allowedResponses: Array, // Permitted response options
    multiRes: Boolean        // Whether multiple responses are allowed
}
```

#### VirtualBarPoll
```typescript
VirtualBarPoll: {
    status: Boolean,          // Whether poll is active
    totalResponders: Number,  // Total number of students who can respond
    totalResponses: Number,   // Total number of responses received
    polls: Object,            // Object containing poll response data
    textRes: Boolean,         // Whether text responses are enabled
    prompt: String,           // The poll question/prompt
}
```

#### CustomPollData
```typescript
CustomPollData: {
    publicPolls: Number[],      // Array of poll IDs that are public
    classroomPolls: Number[],   // Array of poll IDs shared with the classroom
    userCustomPolls: Number[],  // Array of poll IDs the user has access to (owned + shared)    
    customPollsData: {          // Object containing poll data
        [pollId: number]: {
            id: Number,
            owner: Number,
            name: String,
            prompt: String,
            answers: String[],  // Parsed from JSON
            textRes: Boolean,
            blind: Boolean,
            weight: Number,
            public: Boolean
        }
    }
}
```

#### Quiz
Quizzes are not currently functional.
```typescript
Quiz: {
    questions: String[],        // Array of quiz questions
    totalScore: Number,         // Maximum possible score
    numOfQuestions: Number,     // Total number of questions
    pointsPerQuestion: Number   // Score per question (totalScore / numOfQuestions)
}
```

#### Plugin
```typescript
Plugin: {
    id: Number,      // The plugin's ID
    name: String,    // The plugin's name
    url: String      // The plugin's URL
}
```

#### PreviousPoll
```typescript
PreviousPoll: {
    id: Number,             // Poll ID
    class: Number,          // Class ID
    date: String,           // Date of the poll in format "M/D/YYYY"
    data: {
        prompt: String,     // Poll question/prompt
        names: String[],    // Array of student names who responded
        letter: String[],   // Array of button responses
        text: String[].     // Array of text responses
    };
}
```

#### ClassPermissions
```typescript
Classroom: {
    id: Number,
    className: String,
    isActive: Boolean,
    students: {
        [username: String]: {
            username: String,
            tags: String,               // Comma-separated list of tags
            classPermissions: Number,   // Permission level
            activeClasses: String[],    // List of active class IDs
        },
        sharedPolls: Number[],          // List of shared poll IDs
        poll: Poll,                     // Current poll data
        key: String,                    // Class key
        lesson: Object,                 // Lesson data
        activeLesson: Boolean,          // Whether a lesson is active
        currentStep: Number,            // Current lesson step
        quiz: Boolean,                  // Whether a quiz is active
        mode: String,                   // Current class mode
        permissions: ClassPermissions,  // Class permission data
        pollHistory: PreviousPoll[],    // List of previous poll data
        tagNames: String[],
        settings: {
            mute: Boolean,
            filter: String,
            sort: String
        },
        timer: Timer,                   // Timer data
    }
}
```

#### User
```typescript
User: {
    id: Number,
    username: String,
    permissions: Number,
    displayName: String
}
```

| Event Name | Parameters | Permissions | Description |
|------------|------------|--------------|-------------|
| `pollUpdate` | pollData: Poll | Student Permissions | Sends the client new poll data. |
| `modeUpdate` | mode: String | Student Permissions | Sends the client the new mode that the class is in. |
| `quizUpdate` | quizData: Quiz | Student Permissions | Sends the client new class quiz data. NOTE: This is currently non-functional. |
| `vbUpdate` | pollsData: VirtualBarPoll | Guest Permissions | Sends the client new virtual bar data. |
| `customPollUpdate` | customPollData: CustomPollData | Mod Permissions | Sends the client new custom poll data. |
| `pluginUpdate` | pluginData: Plugin | Student Permissions | Sends the client new plugin data. |
| `cpUpdate` | classroomPermissionData: Classroom | Mod Permissions | Sends the client new class permission data. |
| `classBannedUsersUpdate` | bannedUserData: String[] | Teacher Permissions | Sends the client an updated banned users list. |
| `managerUpdate` | user: User[]<br> classrooms: Classroom[] | Manager Permissions | Sends the client data needed for the manager panel. |
