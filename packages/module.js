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
    let specialReturn = null
    switch (command) {
        case 'me':
            validCommand = command;
            break;
            
        case 'myClass':
            let classid 
            get('me', (data) => { classid = data.classId})

            specialReturn = fetch(`${FBJS_URL}/class/${classId}`, reqOptions)  // return the promise
                .then((response) => response.json())
                .then((data) => {
                    callback(data);
                    return data;
                })
                .catch((err) => {
                    console.log('connection closed due to errors', err);
                    throw err;
                });

        default:
            break;
    }
    if (validCommand) {
        return fetch(`${FBJS_URL}/${validCommand}`, reqOptions)  // return the promise
            .then((response) => response.json())
            .then((data) => {
                callback(data);
                return data;
            })
            .catch((err) => {
                console.log('connection closed due to errors', err);
                throw err;
            });
    } else if (specialReturn) {
        return specialReturn 
    } else {
        throw new Error('Invalid option for fbapp.get().')
    }
}

module.exports = { get }; // exports an object with key "me"
