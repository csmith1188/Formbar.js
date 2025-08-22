# What are Digipogs?
Digipogs are a virtual currency used alongside and within Formbar. Digipogs can be transferred, spent, and earned by users on Formbar and related applications. When making a purchase, a percentage of Digipogs is lost between the transaction. They are based on an in-class currency called Pogs — yes, like the 90s game. Digipogs are worth 1/100th of a real Pog, and can be exchanged for one full pog. The current Digipog loss rate in transactions is 50%.

# Using Digipogs in an Application
Digipogs are able to be used in applications unrelated to Formbar. The following steps will walk through how to add Digipogs to an application.

## 1. Installing dependencies
Assuming you already have an application to use Digipogs with, you will need to install the necessary dependencies for your application. For this project, you will need `express`, `dotenv`, and `jsonwebtoken`:
```shell
npm i express dotenv jsonwebtoken
```

## 2. Setting Up a `.env` File
Create a new file in the project directory named `.env`. Within it, add the following:
```env
API_KEY = 'YOUR_API_KEY_HERE'
```

This will prevent others from accessing your API key.

## 3. Setting Up Variables
In your application, ensure you have the following:
```javascript
const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
require('dotenv').confit();
const API_KEY = process.env.API_KEY;
const OWNER = YOUR_FB_ID_HERE;
const FB_URL = 'FORMBAR_URL_HERE;
const THIS_URL = 'YOUR_URL_HERE/REDIRECT_ENDPOINT_HERE';
```

## 4. Handling the transferring
While how you create the transfer payload and handle it in the application will vary, a basic example is the following:

### 1a. Create a transfer payload
Create an object with `amount`, `reason`, and `app` as properties. The amount must be above 0.

```javascript
const data = {
    amount: 20,
    reason: 'Transfer',
    app: 'None'
};
```
### 2a. Encode the transfer payload
Using jsonwebtoken, sign the data using the API_KEY constant
```javascript
const encodedData = jwt.sign(data, API_KEY);
```

### 3a. Redirect the user to Formbar
When the application is prepared to transfer Digipogs, redirect to Formbar at /transfer with your encoded data, owner of the application, and the URL of your application. In the following example, the redirect is simply through a post request.
```javascript
app.post('/transfer', (req, res) => {
    res.redirect(`${FB_URL}/transfer?data=${encodedData}&to=${OWNER}&redirect=${THIS_URL}`);
});
```

### 4a. Handle the redirect from Formbar
Once the user is finished consenting to the transfer, they will be redirected back to the redirect URL. Handle this redirecting by verifying the query's consent variable with jsonwebtoken and handling it as you wish.
```javascript
app.get('/transfer', (req, res) => {
    try {
        const consent = jwt.verify(req.query.consent, API).consent;
        if (consent) {
            res.send('Transfer successful');
        } else {
            res.send('Transfer failed');
        }
    } catch {
        res.redirect('/');
    }
});
```

### 5a. Example Complete Application
Below is an example of a completed application that can use Digipogs

```javascript
const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const API_KEY = 'EXAMPLE_API_KEY';
const OWNER = '2'
const FB_URL = 'http://localhost:420';
const THIS_URL = 'http://localhost:3000/transfer';

app.set('view engine', 'ejs');

const transfer = {
    amount: 20,
    reason: 'Transfer',
    app: 'None'
};

const encodedData = jwt.sign(transfer, API_KEY);

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/transfer', (req, res) => {
    try {
        const consent = jwt.verify(req.query.consent, API_KEY);
        if (consent.consent) {
            res.send('Transfer successful');
        } else {
            res.send('Transfer failed');
        }
    } catch {
        res.redirect('/');
    }
});

app.post('/transfer', (req, res) => {
    res.redirect(`${FB_URL}/transfer?data=${encodedData}&to=${OWNER}&redirect=${THIS_URL}`);
});

app.listen(3000, () => {
    console.log('App is running on port 3000');
});
```


## 5. Conclusion
If you have followed the steps, your application will now be able to transfer digipogs between users. You can use this for a variety of purposes, such as making a purchase for benefits in an application or as a donation.