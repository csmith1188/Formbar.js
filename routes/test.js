module.exports = {
    run(app) {
        app.get('/newControlPanel', (req, res) => {
            res.render('pages/controlPanelRedo');
        })
    }
}