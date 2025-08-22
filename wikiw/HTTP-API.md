# Usage in Python

## Install requests module
```py
pip install requests
```

## Set up constants
```py
FBJS_URL = 'http://172.16.3.100:420/api'
API_KEY = 'get your own api key and put it here'
```

You can get your API key by logging into the instance of FormbarJS you wish to interact with and going to `/apikey`.
## Prepare header for API calls
```py
headers = {
    'API': API_KEY,
    'Content-Type': 'application/json'
}
```

## Make the GET request
```py
import requests

try:
    response = requests.get(f'{FBJS_URL}/me', headers=headers)
    response.raise_for_status()
    data = response.json()
    print(data)
except requests.exceptions.RequestException as err:
    print('Connection closed due to errors:', err)
```

# Usage in NodeJS
## Set up constants
Set the address for the FormbarJS instance you wish to connect to, and your API Key...
```JS
const FBJS_URL = 'http://172.16.3.100:420/api';
const API_KEY = 'get ur own api key and put it here';
```
You can get your API key by logging into the instance of FormbarJS you wish to interact with and going to `/apikey`.
## Prepare header for API calls
```JS
let reqOptions =
{
   method: 'GET',
   headers: {
      'API': API_KEY,
      'Content-Type': 'application/json'
   }
};
```
## Make the GET request
```JS
fetch(`${FBJS_URL}/me`, reqOptions)
   .then((response) => {
      // Convert received data to JSON
      return response.json();
   })
   .then((data) => {
      // Log the data if the request is successful
      console.log(data);
   })
   .catch((err) => {
      // If there's a problem, handle it...
      if (err) console.log('connection closed due to errors', err);
   });
```

# API

## Authentication
Requires api in header

## Permissions
Permissions are in order from highest to least permissions.

Manager - 5<br>
Teacher - 4<br>
Mod - 3<br>
Student - 2<br>
Guest - 1<br>
Banned - 0

## Returnable Objects

### Student
```JS
Username: {
   "loggedIn": Boolean,
   "username": String,
   "id": Integer,
   "permissions": Integer,
   "help": String,
   "break": String,
   "quizScore": String
}
```

### Poll
```JS
"poll": {
   "status": Boolean,
   "responses": Object, // Object of Poll Responses
   "textRes": Boolean,
   "prompt": String,
   "weight": Integer,
   "blind": Boolean
}
```

### Poll Response
```JS
// key is the same as the answer
Key: {
   "answer": String,
   "weight": Float.
   "color": HexString.
   "responses": Integer
}
```

### Help
```JS
"reason": String,
"time": {
   "hours": Integer,
   "minutes": Integer,
   "seconds": Integer
}
```

## Endpoints

### Me
Shows the user's data based on your API key.

#### URL
```GET /me```

#### Authentication
Any permission level.

#### Response
| Parameter        | Type                      | Permissions | Description                                                                                                                                                                                                                                                                                                                                                         |
|------------------|---------------------------|-------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| loggedIn         | Boolean                   | Any         | Indicates whether the user is currently logged in or not. A value of true means the user is logged in, while false means the user is not logged in.                                                                                                                                                                                                                 |
| id               | Integer                   | Any         | The unique identifier for the user. This could be used to reference the user in other parts of the system.                                                                                                                                                                                                                                                          |
| username         | String                    | Any         | The username of the user. This is typically used for display purposes and may also be used for identification in some systems.                                                                                                                                                                                                                                      |
| permissions      | Integer                   | Any         | The permissions level of the user. This could be used to control what actions the user is allowed to perform in the system.                                                                                                                                                                                                                                         |
| classPermissions | Integer                   | Any         | The permissions level of the user within a specific class or course. This could be used to control what actions the user is allowed to perform within a specific class.                                                                                                                                                                                             |
| help             | Object \| False \| Null   | Any         | If there is no help ticket, the value of help will be null. If there is a help ticket, the value of help will be an object that represents the help ticket. For more details about the structure of the help object, please refer to the [help object documentation.](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API#help)                                  |
| break            | String \| Boolean \| Null | Any         | If the user is logged out, the value of break will be null. If the user is logged in and not on break, the value of break will be false. If the user is logged in and on break, the value of break will be true. If the user is logged in and a break request is being processed, the value of break will be a string that describes the break request.             |
| quizScore        | String \| Null            | Any         | If the user is logged out, the value of quizScore will be null. If the user is logged in and has not taken a quiz, the value of quizScore will be an empty string. If the user is logged in and has taken a quiz, the value of quizScore will be a string that represents the user's score from the quiz. The score will be in the format "your score/total score". |
| pogMeter         | Integer \| Null           | Any         | If the user is logged out, the value of pogMeter will be null. If the user is logged in and has not answered a question correctly, the value of pogMeter will be an empty string. If the user is logged in and has answered a question correctly, the value of pogMeter will be an integer that represents the user's progress towards the next digipog.            |


### Class
Shows class's data.

#### URL
```GET /class/{classId}```

#### Authentication
You must be a student and logged into the class.

#### Response
| Parameter    | Type    | Permissions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Description                                                                                                                                                                                                                                                                                                   |
|--------------|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| id           | Integer | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The unique identifier of the class.                                                                                                                                                                                                                                                                           |
| className    | String  | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The name of the class.                                                                                                                                                                                                                                                                                        |
| students     | Object  | <ul><li>loggedIn: Requires student permissions.</li><li>id: Requires student permissions.</li><li>username: Requires student permissions.</li><li>permissions: Requires mod permissions.</li><li>classPermissions: Requires mod permissions.</li><li>help: Requires mod permissions. When mod, you can only see if there is a help ticket. Teachers can see the [help object.](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API#help)</li><li>break: Requires mod permissions. When mod, you can only see if they are on break. Teachers can see the reason.</li><li>quizScore: Requires mod permissions.</li><li>pogMeter: Requires mod permissions.</li></ul> | An object containing the data of each student in the class. Each key in the object is the student's username, and the value is the student's data. For more details about the structure of the student object, refer to the [student object.](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API#student) |
| poll         | Object  | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | An object representing the current poll. For more information refer to the [poll object](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API#poll)                                                                                                                                                         |
| key          | String  | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                               |
| lesson       | Object  | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | An object representing the current lesson.                                                                                                                                                                                                                                                                    |
| activeLesson | Boolean | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A boolean value indicating whether there is an active lesson.                                                                                                                                                                                                                                                 |
| currentStep  | Integer | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | An integer representing the current step of the lesson.                                                                                                                                                                                                                                                       |
| quiz         | Boolean | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A boolean value indicating whether there is a quiz.                                                                                                                                                                                                                                                           |
| mode         | String  | Student                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A string representing the current mode, which could be poll, quiz, lesson, or game.                                                                                                                                                                                                                           |


### Students
Shows all of a class's students.

#### URL
```GET /class/{classId}/students```

#### Authentication
You must be a student and logged into the class.

#### Response
| Parameter | Type   | Permissions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Description                                                                               |
|-----------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| students  | Object | <ul><li>loggedIn: Requires student permissions.</li><li>id: Requires student permissions.</li><li>username: Requires student permissions.</li><li>permissions: Requires mod permissions.</li><li>classPermissions: Requires mod permissions.</li><li>help: Requires mod permissions. When mod, you can only see if there is a help ticket. Teachers can see the [help object.](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API#help)</li><li>break: Requires mod permissions. When mod, you can only see if they are on break. Teachers can see the reason.</li><li>quizScore: Requires mod permissions.</li><li>pogMeter: Requires mod permissions.</li></ul> | [refer to student object](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API#student) |

### Class Poll
Show a class's polls

#### Authentication
You must be logged into the class.

#### URL
```GET /class/{classId}/poll```


#### Response
| Parameter     | Type    | Permissions | Description                                                                                                                                                                                                                                                                                                                                                                 |
|---------------|---------|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| status        | Boolean | Any         | Indicates the current status of the poll. A value of true means a poll is active, while false means no poll is not active.                                                                                                                                                                                                                                                  |
| totalStudents | Integer | Any         | Represents the total number of students in the class.                                                                                                                                                                                                                                                                                                                       |
| responses     | Object  | Any         | An object that represents the current polls. Each key in the object is a possible response to the poll, and the value is the number of students who responded with that response. For more details about the structure of the polls object, please refer to the [poll response object documentation](https://github.com/csmith1188/Formbar.js/wiki/HTTP-API#poll-response). |
| textRes       | String  | Any         | The prompt or question of the current poll.                                                                                                                                                                                                                                                                                                                                 |
| prompt        | String  | Any         | Indicates the weight of the poll. This value represents the contribution of the poll towards the final quiz score and pog meter.                                                                                                                                                                                                                                            |
| weight        | Boolean | Any         | Indicates the weight of the poll. This value represents the contribution of the poll towards the final quiz score and pog meter.                                                                                                                                                                                                                                            |
| blind         | Boolean | Any         | Indicates whether the poll is a blind poll. A value of true means the poll is blind (students can't see others' responses), while false means the poll is not blind.                                                                                                                                                                                                        |

### API Permission Check
Check a user has enough permissions to access an endpoint from their API key. This is used to check permissions for 3rd party API's.

#### URL
```GET /api/apiPermissionCheck```

#### Authentication
You must be logged into the class.

#### Parameters
| Parameter      | Type   | Description                                          |
|----------------|--------|------------------------------------------------------|
| api            | String | The API of the user you are checking permissions of. |
| permissionType | String | The type of permission you are checking for          |

#### Response
| Status Code | Status                | Description                                                             |
|-------------|-----------------------|-------------------------------------------------------------------------|
| 200         | OK                    | An object with the property allowed set to true.                        |
| 400         | Bad Request           | There's an issue with the provided parameters, it will return an error. |
| 403         | Forbidden             | An object with the property reason which is why you are not allowed.    |
| 500         | Internal Server Error | There was a error with the server.                                      |