const express = require('express');
const app = express()
const path = require('path');

app.set('view engine', 'ejs')
app.use(express.static("public"))

app.get('/menu', function(req, res){
   res.render('menu.ejs')
})

app.get('/game', function(req, res){
   res.render('game.ejs')
})

 app.listen(3000)
