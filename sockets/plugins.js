const { database } = require('../modules/database')
const { logger } = require('../modules/logger')
const { logNumbers } = require('../modules/config')
const { classInformation } = require('../modules/class')
const { plugins } = require('../modules/plugins')

module.exports = {
    run(socket, socketUpdates) {
        socket.on('installPlugin', async (data) => {
            const pluginId = data.pluginId;
            const plugins = classInformation.classrooms[data.classId].plugins;
            plugins[pluginId] = {
                name: data.pluginName,
                enabled: false,
            };
            database.run('UPDATE classroom SET plugins=? WHERE id=?', [JSON.stringify(plugins), socket.request.session.classId], (err) => {
                if (err) {
                    logger.log('error', err.stack);
                    return socket.emit('message', {
                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                        title: 'Error'
                    });
                }
                socket.emit('pluginInstall');
            });
        });

        socket.on('swapPlugin', async (data) => {
            const pluginId = data.pluginId;
            const classPlugins = classInformation.classrooms[data.classId].plugins;
            const plugin = classPlugins[pluginId];
            if (!plugin) {
                return socket.emit('message', {
                    message: `Plugin ${pluginId} does not exist`,
                    title: 'Error'
                });
            }
            plugin.enabled = !plugin.enabled;
            classPlugins[pluginId] = plugin;
            database.run('UPDATE classroom SET plugins=? WHERE id=?', [JSON.stringify(classPlugins), socket.request.session.classId], (err) => {
                if (err) {
                    logger.log('error', err.stack);
                    return socket.emit('message', {
                        message: `Error Number ${logNumbers.error}: There was a server error try again.`,
                        title: 'Error'
                    });
                }
                if (plugin.enabled) {
                    plugin.onEnable();
                    socket.emit('pluginEnabled');
                } else {
                    plugin.onDisable();
                    socket.emit('pluginDisabled');
                }
            });
        });
    }
}