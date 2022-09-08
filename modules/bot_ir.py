import ir
import requests
import time

#Wait a minute before logging in.
time.sleep(60)
#This will be changed once there is a better login method in the main app.py

#Send a login POST request
print(requests.post(url="http://localhost:420/login", data={"username":"Formbar Aux", "password":"yes", "bot":"true", "forward":"/"}).text)
#This should instead constantly poll to see if it is already logged in or not

print(requests.get('http://localhost:420/sfx?file=sfx_up03').text)

#Handle the buttons forever
print("Scanning for button presses...")
while True:
    ir.inData = ir.convertHex(ir.getBinary()) #Runs subs to get incomming hex value
    for button in range(len(ir.Buttons)):#Runs through every value in list
        if hex(ir.Buttons[button]) == ir.inData: #Checks this against incomming
            # print(ir.ButtonsNames[button]) #Prints corresponding english name for button
            if ir.ButtonsNames[button] == 'power':
                print("[Power] Flush all students from class")
                requests.get('http://localhost:420/flush')
            elif ir.ButtonsNames[button] == 'func':
                pass
                #changeMode()
            elif ir.ButtonsNames[button] == 'repeat':
                pass
                requests.post(url="http://localhost:420/settings", data={})
            elif ir.ButtonsNames[button] == 'rewind':
                pass
                #rewindBGM()
            elif ir.ButtonsNames[button] == 'play_pause':
                pass
                #playpauseBGM()
            elif ir.ButtonsNames[button] == 'eq':
                requests.get('http://localhost:420/sfx?file=sfx_up03')
            elif ir.ButtonsNames[button] == 'vol_up':
                requests.get('http://localhost:420/bgm?voladj=up')
            elif ir.ButtonsNames[button] == 'vol_down':
                requests.get('http://localhost:420/bgm?voladj=down')
            elif ir.ButtonsNames[button] == 'up':
                requests.get('http://localhost:420/lesson?action=next')
            elif ir.ButtonsNames[button] == 'down':
                requests.get('http://localhost:420/lesson?action=prev')
