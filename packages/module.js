const FBJS_URL = 'http://localhost:420/api';
const API_KEY = '9df608306d132f1e2660344bcedac4beab01f080f1b7052da7ec50d4cdb15197';

let reqOptions = {
    method: 'GET',
    headers: {
        'API': API_KEY,
        'Content-Type': 'application/json'
    }
};

function get(command, callback) {
    let validCommand = '';
    switch (command) {
        case 'me':
            sendCommand(command, callback)
            break;

        case 'myClass':
            sendCommand('me', (data) => {
                sendCommand(`class/${data.classId}`, callback)
            })

            break

        default:
            break;
    }
}

function sendCommand(validCommand, callback) {
    return fetch(`${FBJS_URL}/${validCommand}`, reqOptions)  // return the promise
        .then((response) => {
            if (!response.ok) {
                return response.text().then(text => {
                    console.error('HTTP error! status:', response.status);
                    throw new Error(`HTTP error! status: ${response.status}`);
                });
            }
            return response.json();
        })
        .then((data) => {
            callback(data);
            return data;
        })
        .catch((err) => {
            console.log('connection closed due to errors', err);
            throw err;
        });
}

function getClass(classid, extraOptions, callback) {
    if (extraOptions) {
        sendCommand(`class/${classid}/${extraOptions}`, (data2) => {
            callback(data2)
            return data2
        })
    } else {
        sendCommand(`class/${classid}`, (data2) => {
            callback(data2)
            return data2
        })
    }
}

module.exports = { get, getClass };
