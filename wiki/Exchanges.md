# Exchanges
Exchanges is new system added in Formbar 3.0 that supersedes the deprecated transfer and trade systems. Users can offer and request items and digipogs from other users. The Formbar Developer Pool (ID 0) automatically receives the 10% tax from all transfers

# Transactions vs. Trades
Exchanges can be one-way transactions (requests nothing, sends items/digipogs **immediately**) or two-way (requests items/digipogs, requires approval of the other party).

# Viewing
The `Exchanges` page available on your profile consists of a log of every exchange along with their info and statuses. More specific info and actions can be shown by clicking on the exchange.

# Accepting
If an exchange was one-way, then you will have received the offer as soon as it was created.
Exchanges with pending statuses require you to accept or reject the exchange. Accepting an exchange requires a PIN. This is either your user PIN or the pool PIN (if the recipient is a pool).

# Creation
In the `Exchanges` page, there is a `Create exchange` submenu. After finding the user ID of whoever you want to trade with, you can load their inventory, set your offered digipogs/items, set your requested digipogs/items, and finally create the exchange.

# Exchange Implementation Tutorials

Exchanges let one party send resources to another party, or let two parties propose and accept a trade. Both `from` and `to` can independently use either `"user"` or `"pool"` as their `type`. A `"pool"` type cannot exchange items.

The examples below use the HTTP API at `https://formbarapi.yorktechapps.com`. For the current request schemas, authentication requirements, response definitions, and error responses, see `/docs` in a browser.

## Exchange Payloads

An exchange request has a `from` object and a `to` object:

```json
{
  "from": {
    "id": 1,
    "type": "user",
    "offer": {
      "0": 10,
      "123": 100
    },
    "pin": "12345"
  },
  "to": {
    "id": 2,
    "type": "user",
    "request": {}
  },
  "reason": "Example exchange"
}
```

The keys in `offer` and `request` are item IDs, and their values are quantities. Item ID `"0"` represents digipogs. An empty `request` makes the exchange a one-way transaction. A non-empty `request` makes it a two-way trade. `from` is required to have a PIN.

## Transactions

A one-way transaction sends the `offer` **immediately**. The `to.request` is an empty object. Creating the exchange returns HTTP `200`:

```json
{
  "from": {
    "id": 1,
    "type": "user",
    "offer": {
      "0": 10,
      "1": 20
    },
    "pin": "12345"
  },
  "to": {
    "id": 2,
    "type": "user",
    "request": {}
  },
  "reason": "Example: Sending 10 digipogs and 20 items of ID 1."
}
```

## Trades

A two-way trade includes a non-empty `to.request`. Creating the trade returns HTTP `201` and leaves it pending until it is accepted or rejected:

```json
{
  "from": {
    "id": 1,
    "type": "user",
    "offer": {
      "0": 1000
    },
    "pin": "12345"
  },
  "to": {
    "id": 2,
    "type": "user",
    "request": {
      "27": 30
    }
  },
  "reason": "Example: Selling 30 items of ID 27 for 1000 digipogs"
}
```

## Reponse
The create request includes the completed exchange ID:

```json
{
  "success": true,
  "data": {
    "exchangeId": 123
  }
}
```

### JavaScript

```javascript
const FORMBAR_ADDRESS = 'https://formbarapi.yorktechapps.com';

const exchange = {
    from: {
        id: 1,
        type: '<FROM_TYPE>',
        offer: {
            '0': 10
        },
        pin: '<PIN>'
    },
    to: {
        id: 2,
        type: '<TO_TYPE>',
        request: {}
    },
};

const response = await fetch(`${FORMBAR_ADDRESS}/api/v1/exchanges`, {
    method: 'POST',
    headers: {
        API: '<ACCESS_TOKEN>',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(exchange)
});

console.log(await response.json());
```

### Python

```python
import requests

FORMBAR_ADDRESS = 'https://formbarapi.yorktechapps.com'

exchange = {
    'from': {
        'id': 1,
        'type': '<FROM_TYPE>',
        'offer': {
            '0': 10
        },
        'pin': '<PIN>'
    },
    'to': {
        'id': 2,
        'type': '<TO_TYPE>',
        'request': {}
    }
}

response = requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/exchanges',
    headers={
        'API': '<ACCESS_TOKEN>',
        'Content-Type': 'application/json'
    },
    json=exchange
)

print(response.json())
```

## Completing or Ending an Exchange

The recipient can accept or reject a pending trade. The requester can cancel a pending trade. Each action uses the exchange ID and a `pin` in the request body.

### Accept

```javascript
await fetch(
    'https://formbarapi.yorktechapps.com/api/v1/exchanges/<EXCHANGE_ID>/accept',
    {
        method: 'POST',
        headers: {
            Authorization: 'Bearer <ACCESS_TOKEN>',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pin: '<PIN>' })
    }
);
```

```python
import requests

requests.post(
    'https://formbarapi.yorktechapps.com/api/v1/exchanges/<EXCHANGE_ID>/accept',
    headers={
        'Authorization': 'Bearer <ACCESS_TOKEN>',
        'Content-Type': 'application/json'
    },
    json={'pin': '<PIN>'}
)
```

An accept response includes whether the trade was accepted:

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "reason": null
  }
}
```

### Reject

```javascript
await fetch(
    'https://formbarapi.yorktechapps.com/api/v1/exchanges/<EXCHANGE_ID>/reject',
    {
        method: 'POST',
        headers: {
            Authorization: 'Bearer <ACCESS_TOKEN>',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pin: '<PIN>' })
    }
);
```

```python
import requests

requests.post(
    'https://formbarapi.yorktechapps.com/api/v1/exchanges/<EXCHANGE_ID>/reject',
    headers={
        'Authorization': 'Bearer <ACCESS_TOKEN>',
        'Content-Type': 'application/json'
    },
    json={'pin': '<PIN>'}
)
```

### Cancel

```javascript
await fetch(
    'https://formbarapi.yorktechapps.com/api/v1/exchanges/<EXCHANGE_ID>/cancel',
    {
        method: 'POST',
        headers: {
            Authorization: 'Bearer <ACCESS_TOKEN>',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pin: '<PIN>' })
    }
);
```

```python
import requests

requests.post(
    'https://formbarapi.yorktechapps.com/api/v1/exchanges/<EXCHANGE_ID>/cancel',
    headers={
        'Authorization': 'Bearer <ACCESS_TOKEN>',
        'Content-Type': 'application/json'
    },
    json={'pin': '<PIN>'}
)
```

Reject and cancel return an empty `data` object on success:

```json
{
  "success": true,
  "data": {}
}
```

These actions apply to pending two-way trades. A completed one-way transaction cannot be accepted, rejected, or canceled.

## Viewing an Exchange

Use the exchange ID returned by the create request:

```javascript
const exchangeId = '<EXCHANGE_ID>';

const response = await fetch(
    `https://formbarapi.yorktechapps.com/api/v1/exchanges/${exchangeId}`,
    {
        headers: {
            Authorization: 'Bearer <ACCESS_TOKEN>'
        }
    }
);

console.log(await response.json());
```

```python
import requests

exchange_id = '<EXCHANGE_ID>'

response = requests.get(
    f'https://formbarapi.yorktechapps.com/api/v1/exchanges/{exchange_id}',
    headers={
        'Authorization': 'Bearer <ACCESS_TOKEN>'
    }
)

print(response.json())
```

Only a participant can retrieve an exchange. A successful response has the exchange in `data`:

```json
{
    "success": true,
    "data": {
        "id": 129,
        "to": {
            "id": 1,
            "type": "user",
            "request": {}
        },
        "from": {
            "id": 2,
            "type": "user",
            "offer": {
                "0": 100
            }
        },
        "reason": "Digipog transfer",
        "status": "completed",
        "created": "YYYY-MM-DDThh:mm:ss.sssZ",
        "updated": "YYYY-MM-DDThh:mm:ss.sssZ"
    }
}
```

## Viewing Exchanges for a User

The `/api/v1/user/{userId}/exchanges` endpoint returns *all* the exchanges for a user, successful or not. These results can be filtered down using the `filter` query parameter (along with the standard pagination query parameters `limit` and `offset`). A full list of filters can be viewed on the [API documentation](https://formbarapi.yorktechapps.com/docs).

```javascript
const userId = '<USER_ID>';

const response = await fetch(
    `https://formbarapi.yorktechapps.com/api/v1/user/${userId}/exchanges?filter=inbound,pending`,
    {
        headers: {
            Authorization: 'Bearer <ACCESS_TOKEN>'
        }
    }
);

console.log(await response.json());
```

```python
import requests

user_id = '<USER_ID>'

response = requests.get(
    f'https://formbarapi.yorktechapps.com/api/v1/user/{user_id}/exchanges?filter=inbound,pending',
    headers={
        'Authorization': 'Bearer <ACCESS_TOKEN>'
    }
)

print(response.json())
```

Only exchanges where the user is a participant can be shown. A successful response has the exchanges in `data.exchanges` in the same format as when viewing each exchange individually:

```jsonc
{
    "success": true,
    "data": {
        "exchanges": [/*...*/]
    },
    "pagination": {/*...*/}
}
```