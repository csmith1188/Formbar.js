// Middleware to be used in every route for plugins
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
    // Plugin information
    name: name,
    description: 'This is an example plugin.',
    authors: [0],
    version: '1.0',
    // Plugin functions
    // These functions will be called when the plugin is initialized, enabled, or disabled
    init,
    onEnable,
    onDisable
}