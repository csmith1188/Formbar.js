module.exports = {
    run(app) {
        app.get('/test', (req, res) => {
            res.render('pages/controlPanelRedo');
        })
    }
}