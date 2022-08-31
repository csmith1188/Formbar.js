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
  if (card.number == 1) {
    card.face = "Ace"
  };

  var suits = ["Diamonds", "Clubs", "Hearts", "Spades"];
  var suitIndex = Math.floor(Math.random() * suits.length);
  
  if (card.face == "King" || card.face == "Queen" || card.face == "Jack") {
    console.log(card.face + " of " + suits[suitIndex])
  } else {
    console.log(card.number + " of " + suits[suitIndex])
  };

  if (card.face == "King" || card.face == "Queen" || card.face == "Jack") {
    card.number = 10
  }
  
  cards.push(card)

  var cardtotal = 0;

  for (var currentCard of cards) {
    cardtotal += currentCard.number;
  }

  console.log(`You have a total of ${cardtotal}`);

  if (cardtotal > 21) {
    console.log("You went bust");
    promptLoop = false
    break;
  };
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
};

dealerNum = Math.floor(Math.random() * 5) + 17
  if (cardtotal > dealerNum && cardtotal <= 21) {
    console.log(`You won! The dealer had ${dealerNum}`);
  } else if (cardtotal < dealerNum && cardtotal <= 21) {
    console.log(`You lost! The dealer had ${dealerNum}`);
  } else if (cardtotal == dealerNum) {
    console.log(`It's a push! The dealer had ${dealerNum} `);
  };
