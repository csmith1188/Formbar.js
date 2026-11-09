# Digipogs
Digipogs are digital [pogs](https://en.wikipedia.org/wiki/Milk_caps_(game)). Pogs are coin-shaped toys whose history and explanation are beyond the scope of this documentation. For the purposes of Formbar, digipogs are a currency that can be earned by interacting with the Formbar, and can be transferred to other users, presumably in exchange for some other good or service.

Each student's Digipogs and Pog Meter status can be seen on their profile.

## Earning
When you submit an answer to a poll for the first time, your "Pog Meter" increases. Teachers may configure certain questions and responses to fill pog meters faster by "weight". When the pog meter reaches 500 points, that user receives a random amount of digipogs (1-10) and the meter resets. Teachers can also award digipogs directly to students in their student card on the control panel.

### Pog Meter Details
- Each poll response increases the pog meter by 100 × response weight
- When the meter reaches 500 points, the user earns 1-10 random digipogs
- The meter resets to 0 after earning digipogs
- Only the first response to each poll counts toward the pog meter

## Transferring
When digipogs are transferred between users, Formbar takes a 10% cut of the transfer. This is to control artificial inflation. The tax is automatically added to the Formbar Developer Pool (ID 0).

As an added layer of security, and for physical implementations, you will need the digipog PIN number of the user sending the pogs. This can be found and reset in the user's profile page.

## Digipog Pools
Digipog pools allow users to create shared pools of digipogs that can be distributed among members. Key features:
- Users can create up to 5 pools
- Pool owners can add/remove members
- Pool funds can be distributed equally among all members
- Pools can receive transfers directly by sending a typed recipient such as `{ id: 123, type: "pool" }`, or by using the legacy `pool` field with the pool ID
- The Formbar Developer Pool (ID 0) automatically receives the 10% tax from all transfers

# Digipog Implementation Tutorials
Below are brief tutorials on how to build an application that transfers digipogs with Formbar's HTTP API or WS API. There is a complete example a little further down if that is desired.


## Socket
### Node.JS:
The transfer response is sent directly as a JSON object:
```javascript
socket.on("transferResponse", (response) => {
    console.log("Transfer Response:", response);
    // response will be: { success: true/false, message: "..." }
});
```
Set up your socket.io to talk to the instance of Formbar you want to use, and provide your API key. API keys can be found in `/profile`
```javascript
const io = require('socket.io-client');
// Replace this address with the address of the Formbar you want to use.
const socket = io("https://formbeta.yorktechapps.com/", {
    extraHeaders: {
        api: "<API KEY HERE>"
    }
});
```

You will need to get all of the data you need to do the transaction. In this case, `from` and `to` are the ID numbers of the users. You can get these from each user's `/profile`. The `amount` is the number of digipogs, but remember, a percent of these will be removed as the transaction happens. `reason` is a string to be read by humans that explains why it was transferred. Finally. `pin` is the pin of the sender. You can find this in their `/profile`.

```javascript
// Example Data Object
const data = {
    from: 1,
    to: 2,
    amount: 10,
    reason: "test",
    pin: 1234, // not a string!
    pool: false // Whether or not the digipogs are going into a pool
}
```
Once you have connected successfully, send the transfer.
```javascript
socket.on("connect", () => {
    console.log("Connected to server");
    socket.emit("transferDigipogs", data);
});
```
Complete example:
```javascript
// Connect to Formbar WS API
const io = require('socket.io-client');
// Replace this address with the address of the Formbar you want to use.
const socket = io("https://formbeta.yorktechapps.com/", {
    extraHeaders: {
        api: "<API KEY HERE>"
    }
});

// Example Data Object
const data = {
    from: 1,
    to: 97,
    amount: 10,
    reason: "test",
    pin: 6969,
    pool: false
}

// Wait for successful connection
socket.on("connect", () => {
    console.log("Connected to server");
    // Send the transfer
    socket.emit("transferDigipogs", data);
});

// Check the transfer response
socket.on("transferResponse", (response) => {
    console.log("Transfer Response:", response);
    // response will be: { success: true/false, message: "..." }
});
```

### Python:
For Python, you'll need to install the `python-socketio` package:
```bash
pip install python-socketio
```

The transfer response is sent directly as a JSON object:
```python
import socketio

sio = socketio.Client()

@sio.event
def transferResponse(response):
    print("Transfer Response:", response)
    # response will be: { "success": true/false, "message": "..." }
```

Set up your socket.io client to talk to the instance of Formbar you want to use, and provide your API key. API keys can be found in `/profile`:
```python
# Replace this address with the address of the Formbar you want to use.
sio.connect('https://formbeta.yorktechapps.com/', headers={'api': '<API KEY HERE>'})
```

You will need to get all of the data you need to do the transaction. In this case, `from` and `to` are the ID numbers of the users. You can get these from each user's `/profile`. The `amount` is the number of digipogs, but remember, a percent of these will be removed as the transaction happens. `reason` is a string to be read by humans that explains why it was transferred. Finally. `pin` is the pin of the sender. You can find this in their `/profile`.

```python
# Example Data Object
data = {
    'from': 1,
    'to': 2,
    'amount': 10,
    'reason': 'test',
    'pin': 1234  # not a string!
}
```

Once you have connected successfully, send the transfer:
```python
@sio.event
def connect():
    print("Connected to server")
    sio.emit('transferDigipogs', data)
```

Complete example:
```python
import socketio

sio = socketio.Client()

# Replace this address with the address of the Formbar you want to use.
sio.connect('https://formbeta.yorktechapps.com/', headers={'api': '<API KEY HERE>'})

# Example Data Object
data = {
    'from': 1,
    'to': 97,
    'amount': 10,
    'reason': 'test',
    'pin': 6969
}

@sio.event
def connect():
    print("Connected to server")
    # Send the transfer
    sio.emit('transferDigipogs', data)

@sio.event
def transferResponse(response):
    print("Transfer Response:", response)
    # response will be: { "success": true/false, "message": "..." }

# Keep the connection alive
sio.wait()
```

## Pool Management
Pool management used to be available through socket events. In the current codebase, pool create/add/remove/payout/delete operations are HTTP endpoints under `/api/v1/pools/...`. Use sockets for live class/poll workflows and use HTTP for pool management.

The following code snippets are examples. When used, the snippets should be reprogrammed for other purposes.

### Creating a Pool
```javascript
// Javascript
await fetch(`${FORMBAR_ADDRESS}/api/v1/pools/create`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        name: 'Study Group Pool',
        description: 'Pool for our study group'
    })
});
```

```python
# Python
requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/pools/create',
    headers={'API': API_KEY, 'Content-Type': 'application/json'},
    json={
        'name': 'Study Group Pool',
        'description': 'Pool for our study group'
    }
)
```

### Adding Members to a Pool
```javascript
// Javascript
await fetch(`${FORMBAR_ADDRESS}/api/v1/pools/123/add-member`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: 456 })
});
```

```python
# Python
requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/pools/123/add-member',
    headers={'API': API_KEY, 'Content-Type': 'application/json'},
    json={'userId': 456}
)
```

### Removing Members from a Pool
```javascript
// Javascript
await fetch(`${FORMBAR_ADDRESS}/api/v1/pools/123/remove-member`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: 456 })
});
```

```python
# Python
requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/pools/123/remove-member',
    headers={'API': API_KEY, 'Content-Type': 'application/json'},
    json={'userId': 456}
)
```

### Distributing Pool Funds
```javascript
// Javascript
await fetch(`${FORMBAR_ADDRESS}/api/v1/pools/123/payout`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    }
});
```

```python
# Python
requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/pools/123/payout',
    headers={'API': API_KEY, 'Content-Type': 'application/json'}
)
```

### Deleting a Pool
```javascript
// Javascript
await fetch(`${FORMBAR_ADDRESS}/api/v1/pools/123`, {
    method: 'DELETE',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    }
});
```

```python
# Python
requests.delete(
    f'{FORMBAR_ADDRESS}/api/v1/pools/123',
    headers={'API': API_KEY, 'Content-Type': 'application/json'}
)
```

### Transferring to a Pool
```javascript
// Javascript
socket.emit('transferDigipogs', {
    from: { id: 1, type: 'user' },
    to: { id: 123, type: 'pool' },
    amount: 50,
    reason: 'Contribution to study group',
    pin: 1234
});
```

```python
# Python
sio.emit('transferDigipogs', {
    'from': {'id': 1, 'type': 'user'},
    'to': {'id': 123, 'type': 'pool'},
    'amount': 50,
    'reason': 'Contribution to study group',
    'pin': 1234
})
```

Legacy transfer-to-pool shape:

```javascript
socket.emit('transferDigipogs', {
    from: 1,
    to: 123,
    amount: 50,
    reason: 'Contribution to study group',
    pin: 1234,
    pool: 123
});
```

The old socket pool events (`poolCreate`, `poolDelete`, `poolAddMember`, `poolRemoveMember`, and `poolPayout`) are no longer registered.

## HTTP
### Node.JS:
The HTTP API returns the response directly as JSON:
```javascript
const FORMBAR_ADDRESS = 'https://formbeta.yorktechapps.com';

// Get the data ready
const payload = {
    from: 1,
    to: 2,
    amount: 10,
    reason: 'Transfer',
    pin: 1234
};
```
Make the request
```javascript
fetch(`${FORMBAR_ADDRESS}/api/v1/digipogs/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
}).then((transferResult) => {
    return transferResult.json();
}).then((responseData) => {
    console.log("Transfer Response:", responseData);
    // responseData will be: { success: true, data: { success: true, message: "..." } }
});
```
Complete code
```javascript
const FORMBAR_ADDRESS = 'https://formbeta.yorktechapps.com';

// Get the data ready
const payload = {
    from: 1,
    to: 2,
    amount: 10,
    reason: 'Transfer',
    pin: 1234
};

// Make the transfer request
fetch(`${FORMBAR_ADDRESS}/api/v1/digipogs/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
}).then((transferResult) => {
    return transferResult.json();
}).then((responseData) => {
    console.log("Transfer Response:", responseData);
    // responseData will be: { success: true, data: { success: true, message: "..." } }
});
```

### Python:
For Python, you'll need to install the `requests` package:
```bash
pip install requests
```

The HTTP API returns the response directly as JSON:
```python
import requests
import json

FORMBAR_ADDRESS = 'https://formbeta.yorktechapps.com'

# Get the data ready
payload = {
    'from': 1,
    'to': 2,
    'amount': 10,
    'reason': 'Transfer',
    'pin': 1234
}
```

Make the request:
```python
response = requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/digipogs/transfer',
    headers={'Content-Type': 'application/json'},
    data=json.dumps(payload)
)

response_data = response.json()
print("Transfer Response:", response_data)
# response_data will be: { "success": true, "data": { "success": true, "message": "..." } }
```

Complete code:
```python
import requests
import json

FORMBAR_ADDRESS = 'https://formbeta.yorktechapps.com'

# Get the data ready
payload = {
    'from': 1,
    'to': 2,
    'amount': 10,
    'reason': 'Transfer',
    'pin': 1234
}

# Make the transfer request
response = requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/digipogs/transfer',
    headers={'Content-Type': 'application/json'},
    data=json.dumps(payload)
)

response_data = response.json()
print("Transfer Response:", response_data)
# response_data will be: { "success": true, "data": { "success": true, "message": "..." } }
```

