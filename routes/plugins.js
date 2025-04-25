const { isVerified } = require('../modules/authentication');
const { logger } = require('../modules/logger');
const { logNumbers } = require('../modules/config');
const { plugins } = require('../modules/plugins');

module.exports = {
    run(app) {
        app.get('/plugins/:pluginName?', isVerified, async (req, res) => {
            try {
                // Log the request information
                logger.log('info', `[get /plugins] ip=(${req.ip}) session=(${JSON.stringify(req.session)})`);
                const pluginName = req.params.pluginName;
                if (!pluginName) {
                    return res.send(plugins);
                }
                const plugin = plugins[pluginName];
                if (!plugin) {
                    return res.render('pages/message', {
                        message: 'Plugin not found.',
                        title: 'Error'
                    });
                }
                res.render('pages/plugin', {
                    title: plugin.name,
                    plugin: plugin,
                });
            } catch (err) {
                logger.log('error', err.stack);
                res.render('pages/message', {
                    message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                    title: 'Error'
                });
            }
        });
    }
}