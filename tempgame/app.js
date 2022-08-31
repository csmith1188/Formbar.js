const prompt = require('prompt-sync')();
let promptLoop = false;
//asks if you want to play
var blackJackChoice = prompt('Would you like to play Blackjack? y/n? ')
//if they select yes or no
switch (blackJackChoice) {
  case 'y':
    promptLoop = true;
    break;
  case 'n':
    console.log('Goodbye!');
    promptLoop = false;
    break;
  default:
    console.log('Invalid answer');
    promptLoop = false;
}

var cards = [];
//the loop for hitting and standing
while (promptLoop == true) {

  let card = {
    number: 0,
    face: '',
    suit: ''
  }

   card.number = Math.floor(Math.random() * 13) + 1;

  if (card.number == 11) {
    card.face = "Jack"
  };
  if (card.number == 12) {
    card.face = "Queen"
  };
  if (card.number == 13) {
    card.face = "King"
  };
  if (card.number == 14) {
    card.face = "Ace"
  };

  var suits = ["Diamonds", "Clubs", "Hearts", "Spades"];
  var suitIndex = Math.floor(Math.random() * suits.length);

  console.log(card.number + " of " + suits[suitIndex]);

  if (card.number == "King" || card.number == "Queen" || card.number == "Jack") {
    card.number = 10
  };

  cards.push(card)

  let cardtotal = 0;

  for (var currentCard of cards) {
    cardtotal += currentCard.number;
  }

  console.log(`You have a total of ${cardtotal}`);

  let hitStand  = prompt('Would you like to hit or stand?')
//if they select hit or stand
  if (hitStand == "stand" || hitStand == "Stand") {
    promptLoop = false
  } else if (hitStand =="hit" || hitStand == "Hit") {
    promptLoop = true
  } else {
    console.log("invalid input");
    promptLoop = false
  };
}
