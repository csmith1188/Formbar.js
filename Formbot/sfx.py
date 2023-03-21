import os#Imports operating system.

sound = {}

def updateFiles():
    global sound
    #Empty sound file list
    sound = {}
    #Scan folder for all filenames
    availableFiles = os.listdir(os.path.dirname(os.path.abspath(__file__)) + "/sfx/")
    #Loop through each file
    for file in sorted(availableFiles):
        #Check last four letters are the correct file extension
        if file[-4:] == '.wav' or file[-4:] == '.mp3':
            #Add them to the soundFiles list if so
            sound[file[:-4]] = os.path.dirname(os.path.abspath(__file__)) + "/sfx/" + file