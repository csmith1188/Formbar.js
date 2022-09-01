const prompt = require('prompt-sync')();
let promptLoop = false;
var gameLoop = true
//asks if you want to play
var blackJackChoice = prompt('Would you like to play Blackjack? y/n? ')
while (gameLoop = true) {
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

// Checks to see if the Card has a face then prints Face and Suit to console. If it doesn't have a Face it prints Number and Suit instead
  if (card.face == "King" || card.face == "Queen" || card.face == "Jack" || card.face == "Ace") {
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

// Checks to see if the Card has a face then prints Face and Suit to console. If it doesn't have a Face it prints Number and Suit instead
  if (card.face == "King" || card.face == "Queen" || card.face == "Jack" || card.face == "Ace") {
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

//Prints amount of cards the user has
  console.log(`You have a total of ${cardtotal}`);

// If the User goes over 21 this causes them to bust
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


//This calculates the dealers number
dealerNum = Math.floor(Math.random() * 7) + 17
  if (dealerNum > 21 && cardtotal <= 21) {
    console.log(`The dealer went bust and you won! They had ${dealerNum}`);
  } else if (cardtotal < dealerNum && cardtotal <= 21 && dealerNum <= 21) {
    console.log(`You lost! The dealer had ${dealerNum}`);
  } else if (cardtotal == dealerNum && cardtotal < 21 && dealerNum < 21) {
    console.log(`It's a push! The dealer had ${dealerNum} `);
  } else if (cardtotal > dealerNum && cardtotal <= 21 ) {
    console.log(`You won! The dealer had ${dealerNum}`);
  }

var gameReplay = prompt('Would you like to play again? y/n? ' )
if (gameReplay == "y") {
  gameLoop = true
  console.clear()
} else if (gameReplay == "n") {
  gameLoop = false
  break;
} else {
  console.log("Invalid Input");
  gameLoop = false
  break;
}
}
