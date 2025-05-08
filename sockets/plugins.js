const { database, dbRun } = require('../modules/database')
const { logger } = require('../modules/logger')
const { logNumbers } = require('../modules/config')
const { classInformation } = require('../modules/class')
const { plugins } = require('../modules/plugins')

module.exports = {
    run(socket, socketUpdates) {
        socket.on('installPlugin', async (data) => {
            const pluginId = data.pluginId;
            const plugins = classInformation.classrooms[socket.request.session.classId].plugins;
            plugins[pluginId] = {
                name: data.pluginName,
                enabled: false,
            };
            dbRun('UPDATE classroom SET plugins=? WHERE id=?', [JSON.stringify(plugins), socket.request.session.classId])
                .then(() => {
                    socket.emit('pluginInstalled', pluginId, data.pluginName);
                })
                .catch((err) => {
                    logger.log('error', err.stack);
                    socket.emit('message', `Error Number ${logNumbers.error}: There was a server error try again.`);
                });
        });

        socket.on('uninstallPlugin', async (data) => {
            const pluginId = data.pluginId;
            const classPlugins = classInformation.classrooms[socket.request.session.classId].plugins;
            if (!classPlugins[pluginId]) {
                return socket.emit('message', `Plugin ${pluginId} does not exist`);
            }
            delete classPlugins[pluginId];
            dbRun('UPDATE classroom SET plugins=? WHERE id=?', [JSON.stringify(classPlugins), socket.request.session.classId])
                .then(() => {
                    socket.emit('pluginUninstalled', pluginId);
                })
                .catch((err) => {
                    logger.log('error', err.stack);
                    socket.emit('message', `Error Number ${logNumbers.error}: There was a server error try again.`);
                });
        });

        socket.on('swapPlugin', async (data) => {
            const pluginId = data.pluginId;
            const classPlugins = classInformation.classrooms[socket.request.session.classId].plugins;
            const plugin = classPlugins[pluginId];
            if (!plugin) {
                return socket.emit('message', `Plugin ${pluginId} does not exist`);
            }
            plugin.enabled = !plugin.enabled;
            classPlugins[pluginId] = plugin;
            dbRun('UPDATE classroom SET plugins=? WHERE id=?', [JSON.stringify(classPlugins), socket.request.session.classId])
                .then(() => {
                    socket.emit('pluginSwapped', pluginId, plugin.enabled);
                })
                .catch((err) => {
                    logger.log('error', err.stack);
                    socket.emit('message', `Error Number ${logNumbers.error}: There was a server error try again.`);
                });
            if (plugin.enabled) 
                plugins[pluginId].onEnable();
            else
                plugins[pluginId].onDisable();
        });
    }
}