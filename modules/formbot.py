import requests
import time


class FormBot():
    def __init__(self, username, password, timeout=0, host='127.0.0.1', port=5000):
        self.host = host
        self.port = 5000
        self.username = username
        self.password = password
        self.loggedin = False
        time.sleep(timeout)
        self.login()

    def login(self):
        loginAttempt = requests.post(url="http://"+self.host+":"+str(self.port)+"/login", data={"username": self.username, "password": self.password, "bot": "True", "forward":"/"})

    def tutd(self, thumb):
        url = "http://"+self.host+":"+str(self.port)+"/tutd"
        if thumb.lower() == 'up':
            requests.get(url+'?thumb=up')
        if thumb.lower() == 'down':
            requests.get(url+'?thumb=down')
        if thumb.lower() == 'wiggle':
            requests.get(url+'?thumb=wiggle')
        if thumb.lower() == 'oops':
            requests.get(url+'?thumb=oops')
        else:
            pass
