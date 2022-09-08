'''
This code is based primarily on Lime Parallelogram's tutorial here:
https://www.youtube.com/watch?v=KhiqINyHx08&ab_channel=LimeParallelogram
Original file tag below.
'''
#--------------------------------------------#
#Name - IR-Finalised.py
#Description - The finalised code to read
#   data from an IR sensor and then reference
#   it with stored values
#Author - Lime Parallelogram
#Liscence - Completely Free
#Date - 12/09/2019
#--------------------------------------------#

#Imports modules
import RPi.GPIO as GPIO
from datetime import datetime


# This isn't used yet.
class IRListener():
    def __init__(self):
        self.pin = 4 #Input pin of sensor (GPIO.BOARD)
        self.buttons = {
            'power': 0x300ffa25d,
            'vol_up': 0x300ff629d,
            'func': 0x300ffe21d,
            'rewind': 0x300ff22dd,
            'play_pause': 0x300ff02fd,
            'forward': 0x300ffc23d,
            'down': 0x300ffe01f,
            'vol_down': 0x300ffa857,
            'up': 0x300ff906f,
            '0': 0x300ff6897,
            'eq': 0x300ff9867,
            'repeat': 0x300ffb04f,
            '1': 0x300ff30cf,
            '2': 0x300ff18e7,
            '3': 0x300ff7a85,
            '4': 0x300ff10ef,
            '5': 0x300ff38c7,
            '6': 0x300ff5aa5,
            '7': 0x300ff42bd,
            '8': 0x300ff4ab5,
            '9': 0x300ff52ad
        }

#Static program vars
pin = 4 #Input pin of sensor (GPIO.BOARD)
Buttons = [0x300ffa25d, 0x300ff629d, 0x300ffe21d, 0x300ff22dd, 0x300ff02fd, 0x300ffc23d, 0x300ffe01f, 0x300ffa857, 0x300ff906f, 0x300ff6897, 0x300ff9867, 0x300ffb04f, 0x300ff30cf, 0x300ff18e7, 0x300ff7a85, 0x300ff10ef, 0x300ff38c7, 0x300ff5aa5, 0x300ff42bd, 0x300ff4ab5, 0x300ff52ad]
ButtonsNames = ['power', 'vol_up', 'func', 'rewind', 'play_pause', 'forward', 'down', 'vol_down', 'up', '0', 'eq', 'repeat', '1', '2', '3', '4', '5', '6', '7', '8', '9'] #String list in same order as HEX list

GPIO.setmode(GPIO.BCM)

#Sets up GPIO
GPIO.setup(pin, GPIO.IN)

#Gets binary value
def getBinary():
    #Internal vars
    num1s = 0 #Number of consecutive 1s read
    binary = 1 #The bianry value
    command = [] #The list to store pulse times in
    previousValue = 0 #The last value
    value = GPIO.input(pin) #The current value

    #Waits for the sensor to pull pin low
    while value:
        value = GPIO.input(pin)

    #Records start time
    startTime = datetime.now()

    while True:
        #If change detected in value
        if previousValue != value:
            now = datetime.now()
            pulseTime = now - startTime #Calculate the time of pulse
            startTime = now #Reset start time
            command.append((previousValue, pulseTime.microseconds)) #Store recorded data

        #Updates consecutive 1s variable
        if value:
            num1s += 1
        else:
            num1s = 0

        #Breaks program when the amount of 1s surpasses 10000
        if num1s > 10000:
            break

        #Re-reads pin
        previousValue = value
        value = GPIO.input(pin)

    #Converts times to binary
    for (typ, tme) in command:
        if typ == 1: #If looking at rest period
            if tme > 1000: #If pulse greater than 1000us
                binary = binary *10 +1 #Must be 1
            else:
                binary *= 10 #Must be 0

    if len(str(binary)) > 34: #Sometimes, there is some stray characters
        binary = int(str(binary)[:34])

    return binary

#Conver value to hex
def convertHex(binaryValue):
    tmpB2 = int(str(binaryValue),2) #Tempary propper base 2
    return hex(tmpB2)
