const express = require('express');
const app = express();

app.set('view engine', 'ejs');

const plugin = {
    name: 'PartyPlugin',
    description: 'A plugin that adds party functionality to the app.',
    version: '1.0.0',
    init: () => {
        app.get('/party', (req, res) => {
            res.send('Welcome to the Party!');
        });
    }
}

module.exports = plugin;