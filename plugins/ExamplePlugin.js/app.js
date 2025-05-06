const { isEnabled } = require('../../modules/plugins');
const name = 'ExamplePlugin';

function init(app) {
    // Code to run when the plugin is initialized
    // This is where you can set up routes, middleware, etc
    app.get(`/${name}/example`, isEnabled, (req, res) => {
        res.render('pages/message', {
            message: 'This is an example plugin page.',
            title: 'Example Plugin'
        });
    });
}

function onEnable() {
    // Code to run when the plugin is enabled
    console.log('Plugin enabled');
}

function onDisable() {
    // Code to run when the plugin is disabled
    console.log('Plugin disabled');
}

module.exports = {
    name: name,
    description: 'This is an example plugin.',
    authors: [1],
    version: '1.0',
    init,
    onEnable,
    onDisable
}