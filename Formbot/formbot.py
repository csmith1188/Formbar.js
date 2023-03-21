import requests
import time
import socketio
import json
import board, neopixel
import math
import pygame
import bgm
import ir
import sfx



MAXPIX = 12
# Create a list of neopixels
pixels = neopixel.NeoPixel(board.D21, MAXPIX)

bgm.updateFiles()
sfx.updateFiles()
pygame.init()

# Allows our requests to keep session data
session = requests.Session()
# Connects our wbesocket connections with our http requests
sio = socketio.Client(http_session=session)

global nowPlaying
nowPlaying = "Not Playing"

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
def changeLights(pollData, totalStuds):
    # Two more varibales that increment during loop
    # Changes which pixel in the lightbar we are using
    pixNum = 0
    # Changes which color in the list we are using || Basically changing colors for each answer
    colNum = 0
    # Get total answers in order to later subtract to totalStuds for creating empty light blocks
    totalAnswers = 0
    # Finds the size of each chunk
    if totalStuds:
        pixChunk = int(math.floor(MAXPIX/totalStuds))
        # Loops through all answers
        for x in pollData:
            # Checks to verify if each answer has one or more response
            if pollData[x]:
                # Adds a new light for the amount of responses of an answer
                for y in range(0, pollData[x]):
                    # Used to fill light bar depending on how many students are in the class
                    for number in range(0, pixChunk - 1):
                        # Changes the lights using an rgb color
                        # Uses rgb values so our generated hex must be converted
                        pixels[pixNum] = hex_to_rgb(colors[colNum])
                        # Moves to next pixel
                        pixNum += 1
                    pixels[pixNum] = (0, 0, 0)
                    pixNum += 1
                    colNum += 1
                    totalAnswers += 1
            # Calculate how many students have not answered
            emptyStudents = int(totalStuds - totalAnswers)
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
    return "Done"

# Converts our created hex code to rgb colors to be used for the lights
def hex_to_rgb(hex):
  rgb = []
  for i in (0, 2, 4):
    decimal = int(hex[i:i+2], 16)
    rgb.append(decimal)
  
  return tuple(rgb)

#Wait a minute before logging in.
time.sleep(5)
#Send a login POST request
loginAttempt = session.post("http://192.168.10.12:420/login", {"username":"Formbot", "password":"bot", "loginType": "login", "userType":"bot", "classKey": "bwwu"})

print(loginAttempt.json()['login'])
#Check for successful login
if loginAttempt.json()['login']:
    # Go to the virtualbar page
    thumbData = session.get(url="http://192.168.10.12:420/virtualbar?bot=true")
        
    # Change server data to variables
    totalStuds = totalStudents(thumbData.json())
    pollData = changeData(thumbData.json())
    # Fills lightbar with white pixels
    pixels.fill((30, 30, 30))
    changeLights(pollData, totalStuds)


def my_background_task():
    # do some background work here!
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
                    pass
                elif ir.ButtonsNames[button] == 'vol_down':
                    pass
                elif ir.ButtonsNames[button] == 'up':
                    pass
                elif ir.ButtonsNames[button] == 'down':
                    pass
                elif ir.ButtonsNames[button] == '1':
                    pass
                elif ir.ButtonsNames[button] == '2':
                    pass
                elif ir.ButtonsNames[button] == '3':
                    pass
                elif ir.ButtonsNames[button] == '4':
                    pass
                    
# Runs function from above
sio.connect('http://192.168.10.12:420')
# Allows our bot to join the class room
sio.emit('joinRoom', 'a1')
# Allows our bot to recieve data from server on poll change
@sio.on('vbData')
def vbData(data):
    data = json.loads(data)
    totalStuds = totalStudents(data)
    pollData = changeData(data)
    # Fills lightbar with white pixels
    pixels.fill((30, 30, 30))
    changeLights(pollData, totalStuds)

stop = "Pause"
volume = 1.0
sfxPlaying = "Not Playing"

@sio.on('bgmGet')
def bgmGet():
    print("Load")
    print(nowPlaying)
    print(stop)
    sio.emit('bgmLoad', {'files': bgm.bgm, 'playing': nowPlaying, "stop": stop})
    
@sio.on('bgmPlay')
def bgmPlay(file):
    pygame.mixer.music.load(bgm.bgm[file])
    global nowPlaying
    nowPlaying = file
    global stop
    stop = "Play"
    pygame.mixer.music.set_volume(volume)
    pygame.mixer.music.play(loops=-1)

@sio.on('bgmPause')
def bgmPause(play):
    global stop
    stop = play
    if play == 'Pause':
        pygame.mixer.music.pause()
    elif play == 'Play':
        pygame.mixer.music.unpause()

@sio.on('sfxGet')
def bgmGet():
    print("SFX Get")
    sio.emit('sfxLoad', {'files': sfx.sound, "playing": sfxPlaying})

@sio.on('sfxPlay')
def sfxPlay(file):
    pygame.mixer.Sound(sfx.sound[file]).play()

# Allows program to stay open while waiting for websocket data to be sent
task = sio.start_background_task(my_background_task)


