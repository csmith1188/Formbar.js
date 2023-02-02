import requests
import time
import socketio
import json
import board, neopixel

session = requests.Session()
sio = socketio.Client(http_session=session)

@sio.event
def connect():
    print('connection established')
    
  
def changeData(data):
    studResponses = {}
    for answer in data["posPollResObj"].keys():
        studResponses[answer] = 0
    for student in data["students"].keys():
        print(data["students"][student]["pollRes"])
        if data["students"][student]["pollRes"]:
            studResponses[data["students"][student]["pollRes"]] += 1
    return studResponses


#Wait a minute before logging in.
time.sleep(5)
#Send a login POST request
loginAttempt = session.post("http://192.168.10.12:420/login", {"username":"Formbot", "password":"bot", "loginType": "login", "userType":"bot", "className": "a1"})

print(loginAttempt.json()['login'])
#Check for successful login
if loginAttempt.json()['login']:
    # Go to the virtualbar page
    thumbData = session.get(url="http://192.168.10.12:420/virtualbar?bot=true")
        
    # Change server data to variables
    pollData = changeData(thumbData.json())
    print(pollData)


sio.connect('http://192.168.10.12:420')
sio.emit('joinRoom', 'a1')
@sio.on('vbData')
def vbData(data):
    print(data)
    data = json.loads(data)
    pollData = changeData(data)
    print(pollData)
sio.wait()


