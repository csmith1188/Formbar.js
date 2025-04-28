module.exports = {
    name: 'PartyPlugin',
    description: 'A plugin for party functionality',
    version: '1.0.0',
    init() {
        console.log('Party Plugin initialized!');
    },
    run(app) {
        app.get('/party', (req, res) => {
            res.send('Party Plugin is working!');
        });
    }
}