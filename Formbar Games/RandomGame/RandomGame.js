
function load_images(){
    //player , virus , gem
    enemy_img = new Image();
    enemy_img.src = "Assets/enemy.png";

    player_img = new Image();
    player_img.src = "Assets/fighter.png";

    gem_img2 = new Image;
    gem_img2.src = "Assets/vac1.png";

    gem_img = new Image;
    gem_img.src = "Assets/vac.gif";

    win = new Audio();
    win.src = "Audio/won.wav";

    lose = new Audio();
    lose.src = "Audio/dead.mp3";


}
function init(){
    cvs = document.getElementById('mycanvas');
    W = cvs.width = 1252;
    H = cvs.height = 516;
    pen = cvs.getContext('2d');
    game_over = false;

    e1 = {
        x:200,
        y:50,
        w:80,
        h:80,
        speed:20,
    };
     e2 = {
        x:450,
        y:150,
        w:80,
        h:80,
        speed:35,
    };


     e3 = {
        x:700,
        y:300,
        w:80,
        h:80,
        speed:20,
    };
    e4 = {
        x:900,
        y:100,
        w:80,
        h:80,
        speed:25,
    };

    enemy = [e1,e2,e3,e4];
    player = {
        x:20,
        y:H/2,
        w:110,
        h:110,
        speed:30,
        health:100,
        moving:"false"
    }
    gem = {
        x:W-150,
        y:H/2,
        w:150,
        h:150,
    }
    cvs.addEventListener('mousedown',function(){
        console.log("Mouse Pressed");
        player.moving = true;
    });
    cvs.addEventListener('mouseup',function(){
        console.log("Mouse Released");
        player.moving = false;
    });
    document.addEventListener('keydown', function(event) {
    if(event.keyCode == 37) {
      console.log("Mouse Pressed");
      player.moving = true;
    }
    else if(event.keyCode == 39) {
      console.log("Mouse Released");
      player.moving = false;
    }
});
}
function isOverlap(rect1,rect2){
    if (rect1.x < rect2.x + rect2.w &&
   rect1.x + rect1.w > rect2.x &&
   rect1.y < rect2.y + rect2.h &&
   rect1.y + rect1.h > rect2.y) {
    return true
    }

    return false;

}
function draw(){
   pen.clearRect(0,0,W,H);
   //pen.fillRect(box.x,box.y,box.w,box.h);
  //pen.drawImage(enemy_img,box.x,box.y,box.w,box.h);
    for(let i = 0; i<enemy.length; i++){
     pen.drawImage(enemy_img,enemy[i].x,enemy[i].y,enemy[i].w,enemy[i].h);
    }
    // draw the player
    pen.drawImage(player_img,player.x,player.y,player.w,player.h);

     pen.drawImage(gem_img,gem.x,gem.y,gem.w,gem.h);

    pen.fillStyle = "white";
    pen.font = "30px Roboto";
    pen.fillText("Score " + player.health,30,30);
}
function update(){
//    box.y += box.speed;
//    if(box.y > H-box.h || box.y <= 0){
//        box.speed   *= -1;
//    }
    // if player is moving
    if(game_over){
        return;
    }
    if(player.moving == true){
        player.x += player.speed;
        player.health += 20;

    }
    for(let i = 0; i<enemy.length;i++){
        if(isOverlap(enemy[i],player)){
            lose.play();
            player.health -= 100;
            if(player.health < 0){
                draw();
                lose.play();
                alert("You're horrible' ");
                game_over = true;
                return;
            }
        }
    }
    if(isOverlap(player,gem)){
        win.play();
        alert("You Won " + player.health);
        game_over = true;
        return;
    }

    for(let i = 0; i<enemy.length; i++){
        enemy[i].y += enemy[i].speed;
        if(enemy[i].y > H-enemy[i].h || enemy[i].y <= 0){
            enemy[i].speed *= -1;
        }
    }
}
function gameloop(){
    if(game_over){
        clearInterval(f);
        if (window.confirm("Do you really want to retry??")) {
          player = {
              x:20,
              y:H/2,
              w:110,
              h:110,
              speed:30,
              health:100,
              moving:"false"
          }
        game_over = false;
        var f = setInterval(gameloop,1000000);
} else {
  window.open("index.html");
}
    }
    draw();
    update();
}
load_images();
init();
var f = setInterval(gameloop,100);
