const { logger } = require("../modules/logger");
const { passwordRequest } = require("../modules/student");

module.exports = {
    run(app, io) {
        app.get('/changepassword', (req, res) => {
            try {
                res.render("pages/changepassword", {
                    title: "Change Password"
                })
            } catch (err) {
                logger.log("error", err.stack);
            }
        });
        
        app.post("/changepassword", (req, res) => {
            try {
                if (req.body.newPassword != req.body.confirmPassword) {
                    res.render("pages/message", {
                        message: "Passwords do not match",
                        title: "Error"
                    });
                } else {
                    passwordRequest(req.body.newPassword, req.body.username);
                    res.redirect("/login");
                }
            } catch (err) {
                logger.log("error", err.stack);
            };
        });
        
    }
}