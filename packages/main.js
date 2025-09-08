const fbapp = require('./module.js');  // relative path to the file

fbapp.get('me', (data) => {
    console.log(data);
})
fbapp.get('myClass', (data) => {
    console.log(data);
})