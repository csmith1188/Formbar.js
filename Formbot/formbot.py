import requests
import time
import socketio
import json
import board, neopixel
import math
import pygame
import jwt
import bgm
import ir
import sfx
import sqlite3
from functools import wraps
from flask import Flask, render_template, request, redirect, make_response
from flask_socketio import SocketIO, emit

#Setting up flask app
app = Flask(__name__)
app.secret_key = 'your-secret-key-here'
flaskio = SocketIO(app, logger = False)


# For the formbar oauth2 service
# API key for Oauth2
# Should be changed accordingly
app.config['SECRET_KEY'] = '817c072f84778b8810ffed89e4246b380ff6808915ae645778e892278075dd313f4f192fb88ca8f7f4ddac89b9f3332c6ab3e9cb1e5f130e60b354a1905bdb53'

# Adds all constants to change class and formbar address
# Login type is always  'bot' and classname is your class
CLASSIP = "http://192.168.10.20:420"
CLASSKEY = "nz1v"
LOGINTYPE = "bot"
CLASSNAME = "a"

# Number of Pixels the bar has
MAXPIX = 12
# Create a list of neopixels
pixels = neopixel.NeoPixel(board.D21, MAXPIX, auto_write=False)

# Starts bgm and sfx players
bgm.updateFiles()
sfx.updateFiles()
pygame.init()

# Defaults for bgm and sfx
global nowPlaying
nowPlaying = "Not Playing"
stop = "Pause"
global volume
volume = 1.0
sfxPlaying = "Not Playing"
global blindMode
blindMode = False


#Decorator for JWT(middleware)
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        # jwt token passed through url params
        if 'token' in request.args:
            token = request.args.get('token')
        # return 401 if token is not passed
        if not token:
            print("No token")
            return "No token", 401

        try:
            # decodes the token and stores user credentials
            data = jwt.decode(token, app.config['SECRET_KEY'])
            # assigns data to a object to be used in the oauth2 endpoint
            user = {'username': data['username'], 'permissions': str(data['permissions']), 'expire': data['exp'], 'token': token}
        except:
            print("No token")
            return "Bad token", 401
        # returns the current logged in users context to the oauth2 endpoint
        return  f(user, *args, **kwargs)

    return decorated


def authenticate_user(f):
    @wraps(f)
    def decorated2(*args, **kwargs):
        # Acccesses cookies to verify user
        print(request.cookies.get('username'))
        if 'username' in request.cookies:
            return f(request.cookies.get('username'))
        else:
            return redirect('/login')
    return decorated2

# Flask Endpoints
@app.route('/login')
def login():
    return render_template('index.html', apikey=app.config['SECRET_KEY'])

@app.route('/')
@authenticate_user
def index(username):
    if username:
        return redirect('/login')

@app.route('/oauth', methods = ["POST","GET"] )
@token_required
def get_all_users(user):
    # Sets the route we are redirecting to after setting cookies
    resp = make_response(redirect("/home", code=302))
    # Sets each individual cookie for the user credentials
    resp.set_cookie('username', value=user['username'], expires=user['expire'])
    resp.set_cookie('permissions', value=user['permissions'], expires=user['expire'])
    resp.set_cookie('token', value=user['token'], expires=user['expire'])
    return resp

@app.route('/home')
@authenticate_user
def home(username):
    return "Hello " + username + ' ' + request.cookies.get('permissions')


@app.route('/bgm')
@authenticate_user
def bgmusic(username):
    return render_template('bgm.html')

# Flask Socketio
@flaskio.on('bgmGet')
def bgmGet():
    # Emits bmg data
    # Checks all files with imorted bgm module
    # Checks if music is currentlt playing and if music is paused
    emit('bgmLoadUpdate', {'files': bgm.bgm, 'playing': nowPlaying, "stop": stop}, broadcast= True)

@flaskio.on('bgmPlay')
def bgmPlay(file):
    pygame.mixer.music.load(bgm.bgm[file])
    global nowPlaying
    nowPlaying = file
    global stop
    stop = "Play"
    pygame.mixer.music.set_volume(volume)
    pygame.mixer.music.play(loops=-1)

@flaskio.on('bgmPause')
def bgmPause(play):
    global stop
    stop = play
    if play == 'Pause':
        pygame.mixer.music.pause()
    elif play == 'Play':
        pygame.mixer.music.unpause()

'''
Old code before formbot flask
Can be used to be converted into flask to build sfx page

@sio.on('sfxGet')
def bgmGet():
    print("SFX Get")
    sio.emit('sfxLoad', {'files': sfx.sound, "playing": sfxPlaying})

@sio.on('sfxPlay')
def sfxPlay(file):
    sfxPlaying = file
    pygame.mixer.Sound(sfx.sound[file]).play()
'''




# Allows our requests to keep session data
session = requests.Session()
# Connects our client websocket connections with our http requests
sio = socketio.Client(http_session=session)


# Connects us to websockets
@sio.event
def connect():
    print('connection established')



# Changes data recieved from websockets to more usable objects
def changeData(data):

    studResponses = {}
    # Defines global color variable
    global colors
    colors = []
    # Creates its own color for all possible answers
    for i in range(len(data["posPollResObj"].keys())):
        color = ''
        CC = '0123456789ABCDEF'
        colorI = CC[math.floor(i/2)]
        colorJ = CC[15 - math.floor(i/2)]
        if i%4==0:
            color = colorJ + colorJ + colorI + colorI + colorI + colorI
        elif i%4==1:
            color = colorI + colorI + colorJ + colorJ + colorI + colorI
        elif i%4==2:
            color = colorI + colorI + colorI + colorI + colorJ + colorJ
        elif i%4==3:
            color = colorJ + colorJ + colorJ + colorJ + colorI + colorI
        # Adds hex colors to a list
        colors.append(color)
    # Both loops take the data from the server and turn it into more organized and readable code
    for answer in data["posPollResObj"].keys():
        studResponses[answer] = 0
    for student in data["students"].keys():
        if data["students"][student]["permissions"] == 2:
            if data["students"][student]["pollRes"]:
                studResponses[data["students"][student]["pollRes"]] += 1
    return studResponses

# Gets the total number of students(all users with permission level 2)
# Sorts out the teacher and all other users who aren't students
# Also used to fill lights with students who have not answered
def totalStudents(data):
    totalStuds = 0
    for student in data["students"].keys():
        if data["students"][student]["permissions"] == 2:
            totalStuds += 1
    return totalStuds

# Uses the converted data to change the lightbar
# pollData is all answers
def changeLights(pollData, totalStuds):
    # Two more varibales that increment during loop
    # Changes which pixel in the lightbar we are using
    pixNum = 0
    # Changes which color in the list we are using || Basically changing colors for each answer
    colNum = 0
    # Get total answers in order to later subtract to totalStuds for creating empty light blocks
    totalAnswers = 0

    if totalStuds:
        # Finds the size of each chunk
        pixChunk = int(math.floor(MAXPIX/totalStuds))
        # Loops through all answers
        for x in pollData:
            # Checks to verify if each answer has one or more response
            if pollData[x]:
                # Adds a new light for the amount of responses of an answer
                for y in range(0, pollData[x]):
                    # Changes a chunk(answer) of the light bar. Adds one response to bar
                    for number in range(0, pixChunk - 1):
                        # Changes the lights using an rgb color
                        global blindMode
                        if blindMode:
                            pixels[pixNum] = hex_to_rgb('FFAA00')
                        else:
                            # Uses rgb values so our generated hex must be converted
                            pixels[pixNum] = hex_to_rgb(colors[colNum])
                        # Moves to next pixel
                        pixNum += 1
                    # Sets a blank pixel in between each answer
                    pixels[pixNum] = (0, 0, 0)
                    pixNum += 1
                    # Increment total answers
                    totalAnswers += 1
            # Move to next color
            colNum += 1
            # Calculate how many students have not answered
            emptyStudents = int(totalStuds - totalAnswers)
            if totalStuds == totalAnswers and blindMode is True:
                blindMode = False
                changeLights(pollData, totalStuds)
        # Check if any students have not asnwered
        if emptyStudents > 0:
            # Loops through for all students who have not answered and makes a blank chunk
            for y in range(0, emptyStudents):
                # Create the pixel chunks
                for number in range(0, pixChunk - 1):
                    # Changes the lights using an rgb color
                    # Uses rgb values so our generated hex must be converted
                    pixels[pixNum] = (30, 30, 30)
                    # Moves to next pixel
                    pixNum += 1
                pixels[pixNum] = (0, 0, 0)
                pixNum += 1
            # Moves to next color in list
            colNum += 1
    # Displays pixels all at one time
    pixels.show()
    return "Done"

# Converts our created hex code to rgb colors to be used for the lights
def hex_to_rgb(hex):
  rgb = []
  for i in (0, 2, 4):
    decimal = int(hex[i:i+2], 16)
    rgb.append(decimal)

  return tuple(rgb)

# Login the bot into formbar in order to receive websockets

#Wait a few seconds before logging in.
time.sleep(5)
#Send a login POST request
global loginAttempt
def attemptLogin():
    try:
        # Send a post request to formbar with apikey and classkey
        loginAttempt = session.post(CLASSIP + "/login", {"username":"", "password":"", "loginType": LOGINTYPE, "userType":"", "classKey": CLASSKEY, "apikey": app.config['SECRET_KEY']})
        print(loginAttempt.json()['login'])
        # Should return True or False
        return loginAttempt.json()['login']
    except requests.exceptions.RequestException as e:
        # If request didnt work return false to retry again
        return False

# Calls for first login attempt
loginAttempt = attemptLogin()
# Displays login attempt
print(loginAttempt)
#Check for successful login
if loginAttempt:
    # Go to the virtualbar page
    thumbData = session.get(url=CLASSIP + "/virtualbar?bot=true")

    # Change server data to variables
    totalStuds = totalStudents(thumbData.json())
    pollData = changeData(thumbData.json())
    # Fills lightbar with white pixels
    pixels.fill((30, 30, 30))
    changeLights(pollData, totalStuds)

else:
    # If login failed retry in 8 seconds
    while loginAttempt == False:
        time.sleep(8)
        loginAttempt = attemptLogin()
        print(loginAttempt)



# Connects out client to formbar socket server
sio.connect(CLASSIP)
# Allows our bot to join the class room using classname
sio.emit('joinRoom', CLASSNAME)

def my_background_task():
    # Background task for remote control
    # Check ir.py for how to use module
    # Check old formbar for more information on remote control
    while True:
        ir.inData = ir.convertHex(ir.getBinary())
        for button in range(len(ir.Buttons)):#Runs through every value in list
            if hex(ir.Buttons[button]) == ir.inData: #Checks this against incomming
                if ir.ButtonsNames[button] == 'power':
                    print("power")
                elif ir.ButtonsNames[button] == 'func':
                    pass
                elif ir.ButtonsNames[button] == 'repeat':
                    pass
                elif ir.ButtonsNames[button] == 'rewind':
                    pygame.mixer.music.play(loops=-1)
                elif ir.ButtonsNames[button] == 'play_pause':
                    if (stop == "Pause"):
                        sio.emit('bgmPause', "Play")
                        sio.emit('bgmLoad', {'files': bgm.bgm, 'playing': nowPlaying, "stop": "Pause"})
                    else:
                        sio.emit('bgmPause', "Pause")
                        sio.emit('bgmLoad', {'files': bgm.bgm, 'playing': nowPlaying, "stop": "Play"})
                elif ir.ButtonsNames[button] == 'eq':
                    pass
                elif ir.ButtonsNames[button] == 'vol_up':
                    global volume
                    volume = volume + 0.1
                    print(volume)
                    pygame.mixer.music.set_volume(volume)
                elif ir.ButtonsNames[button] == 'vol_down':

                    volume = volume - 0.1
                    print(volume)
                    pygame.mixer.music.set_volume(volume)
                elif ir.ButtonsNames[button] == 'up':
                    pass
                elif ir.ButtonsNames[button] == 'down':
                    pass
                elif ir.ButtonsNames[button] == '0':
                    sio.emit('endPoll')
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '1':
                    pass
                elif ir.ButtonsNames[button] == '2':
                    sio.emit('botPollStart', 2)
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '3':
                    sio.emit('botPollStart', 3)
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '4':
                    sio.emit('botPollStart', 4)
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '5':
                    sio.emit('botPollStart', 5)
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '6':
                    sio.emit('botPollStart', 6)
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '7':
                    sio.emit('botPollStart', 7)
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '8':
                    sio.emit('botPollStart', 8)
                    sio.emit('reload')
                    sio.emit('cpupdate')
                elif ir.ButtonsNames[button] == '9':
                    sio.emit('botPollStart', 9)
                    sio.emit('reload')
                    sio.emit('cpupdate')


# Allows our bot to recieve data from server on poll change
@sio.on('vbData')
def vbData(data):
    # Receve data from formbar sockets
    # Convets data to object
    data = json.loads(data)
    global blindMode
    blindMode = data['blindPoll']
    # Gets total students
    totalStuds = totalStudents(data)
    # Changes our data for lightbar changes
    pollData = changeData(data)
    # Fills lightbar with white pixels
    pixels.fill((30, 30, 30))
    # Changes lights accordingly
    changeLights(pollData, totalStuds)

# Updates formbar to remove all light on poll start
@sio.on('vbUpdate')
def vbUpdate():
    sio.emit('vbData')

@sio.event
def disconnect():
    print("I'm Disconnected")
    loginAttempt = False
    # If formbot gets disconnect continue to retry
    while loginAttempt == False:
        time.sleep(8)
        loginAttempt = attemptLogin()
        print(loginAttempt)

# Allows program to stay open while waiting for websocket data to be sent
# Starts remote control in the background
task = sio.start_background_task(my_background_task)


# Starts flask server
if __name__ == '__main__':
   flaskio.run(app, host="0.0.0.0")