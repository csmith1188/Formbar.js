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
> **Deprecated:** Direct digipog transfers are deprecated. For new integrations, use Exchanges instead. See the [Exchanges page](https://github.com/csmith1188/Formbar.js/wiki/Exchanges) and the Exchanges endpoints in the [API documentation](https://www.formbarapi.yorktechapps.com/docs).

When digipogs are transferred between users, Formbar takes a 10% cut of the transfer. This is to control artificial inflation. The tax is automatically added to the Formbar Developer Pool (ID 0).

As an added layer of security, and for physical implementations, you will need the digipog PIN number of the user sending the pogs. This can be found on and reset from the user's profile page.

## Digipog Pools
Digipog pools allow users to create shared pools of digipogs that can be distributed among members. Key features:
- Pool shares can be traded for pool membership
- Pool funds can be distributed amongst members according to the amount of shares they hold.
- Pools can send or receive digipogs directly by sending a typed recipient such as `{ id: 123, type: "pool" }` (See [Exchanges](https://github.com/csmith1188/Formbar.js/wiki/Exchanges))
- The Formbar Developer Pool (ID 0) automatically receives the 10% tax from all transfers

# Legacy Digipog Transfer Examples
The examples below are retained for existing integrations only. The HTTP transfer endpoint and the Socket.IO transfer flow are deprecated; use the Exchanges workflow for new integrations.


## Legacy Socket.IO Transfers
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
const socket = io("https://formbarapi.yorktechapps.com/", {
    extraHeaders: {
        api: "<API KEY HERE>"
    }
});
```

You will need to get all of the data you need to do the transaction. In this case, `from` and `to` are the ID numbers of the users. You can get these from each user's `/profile`. The `amount` is the number of digipogs, but remember, a percent of these will be removed as the transaction happens. `reason` is a string to be read by humans that explains why it was transferred. Finally, `pin` is the pin of the sender. You can find this in their `/profile`.

```javascript
// Example Data Object
const data = {
    from: 1,
    to: 2,
    amount: 10,
    reason: "test",
    pin: 1234, // not a string!
    type: "user"
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
const socket = io("https://formbarapi.yorktechapps.com/", {
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
    type: "user"
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
sio.connect('https://formbarapi.yorktechapps.com/', headers={'api': '<API KEY HERE>'})
```

You will need all of the data required to complete the transaction. In this case, `from` and `to` are the ID numbers of the users. You can get these from each user's `/profile`. The `amount` is the number of digipogs, but remember, a percentage of these will be removed as the transaction happens. `reason` is a string to be read by humans that explains why it was transferred. Finally, `pin` is the pin of the sender. You can find this in their `/profile`.

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
sio.connect('https://formbarapi.yorktechapps.com/', headers={'api': '<API KEY HERE>'})

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
Users gain membership by obtaining shares. See the [Exchanges Page](https://github.com/csmith1188/Formbar.js/wiki/Exchanges) for more information on obtaining shares. Directly adding members to a pool is legacy behavior that was removed.

### Pool Pins
A pool pin is required to payout pools. It can be set and changed by going to `/pools`, clicking the key icon, and inputting your old and new pin. You may also click `I forgot my pin` to get a pin-reset email.

### Distributing Pool Funds
Digipog pools require a pin to be paid out. Each pool has its own pin. Pools can be paid out by percentage or digipog amount. The funds will be distributed amongst all share holders. The amount sent to each user depends on the amount of shares they own.

To do this, visit the `/pools` page,  click the payout icon, enter your pin, type an amount or percentage, and click `Payout`. Digipogs are distributed based on the amount of shares each user owns. For example, say `user1` has 80 shares and `user2` has 20. `user1` decides to pay out 100 digipogs. `user1` will receive 80 digipogs, and `user2` will receive 20. 

Here is an example using the HTTP API:

```javascript
// Javascript
await fetch(`${FORMBAR_ADDRESS}/api/v1/pools/123/payout`, {
    method: 'POST',
    headers: {
        API: API_KEY,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        amount: 100, // Either a percent or an amount of digipogs. Specifies how much should be paid out.
        payoutType: 'digipogs', // Specify "percent" or "digipogs"
        pin: 1234
    })
});
```

```python
# Python
requests.post(
    f'{FORMBAR_ADDRESS}/api/v1/pools/123/payout',
    headers={'API': API_KEY, 'Content-Type': 'application/json'},
    json={'amount': 100, 'payoutType': 'digipogs', 'pin': 1234}
)
```

### Deleting a Pool

When a pool is deleted, every user with shares in that pool loses them. Pools can be deleted by going to `/pools`, then clicking the delete button on a specific pool.

Here is an example using the HTTP API:

```javascript
// Javascript
await fetch(`${FORMBAR_ADDRESS}/api/v1/pools/123`, { // 123 is the pool's id.
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

### Legacy Transfer to a Pool
This Socket.IO transfer shape is deprecated. Use the Exchanges workflow instead; see the [Exchanges page](https://github.com/csmith1188/Formbar.js/wiki/Exchanges).
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

The old socket pool events (`poolCreate`, `poolDelete`, `poolAddMember`, `poolRemoveMember`, and `poolPayout`) are no longer registered.

## Legacy HTTP Transfers
`POST /api/v1/digipogs/transfer` is deprecated. Use the Exchanges workflow instead; see the [Exchanges page](https://github.com/csmith1188/Formbar.js/wiki/Exchanges) and the Exchanges endpoints in `/docs`.
