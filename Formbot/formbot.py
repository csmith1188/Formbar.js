import requests
import time
import RPi.GPIO as GPIO

session = requests.Session()
#Wait a minute before logging in.
time.sleep(5)
#Send a login POST request
loginAttempt = session.post("http://192.168.10.12:420/login", {"username":"Formbot", "password":"bot", "loginType": "login", "userType":"bot", "className": "a1"})

print(loginAttempt.json()['login'])
#Check for successful login
if loginAttempt.json()['login']:
    
    # Go to the virtualbar page
    thumbData = session.get(url="http://192.168.10.12:420/virtualbar?bot=true")

    print(thumbData.text)
    #This should instead constantly poll to see if it is already logged in or not
    print('Hello')

