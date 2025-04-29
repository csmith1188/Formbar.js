function run(app) {
    app.get('/party', (req, res) => {
        res.send('Party Plugin is running!');
    })
}

module.exports = {
    name: 'PartyPlugin',
    description: 'Parties, for the party life.',
    version: '1.0.0',
    author: 'Jesse Bailey-Motts',
    init(app) {
        run(app);
    },
}