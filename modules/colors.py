colors = {
    "blind": (255, 128, 0),
    "default": (64, 64, 64),
    "student": (255, 0, 255),
    "fg": (64, 64, 64),
    "bg": (0, 0, 0),
    "white": (255, 255, 255),
    "red": (255, 0, 0),
    "blue": (0, 0, 255),
    "green": (0, 255, 0),
    "yellow": (255, 255, 0),
    "purple": (255, 0, 255),
    "cyan": (0, 255, 255),
    "orange": (255, 128, 0)
}#Imports color codes

def hex2dec(hexVal):
    #see if the hex value is in string format
    if type(hexVal) is str:
        #if there's a # in the front, remove it
        if hexVal[0] == "#":
            hexVal = hexVal[1:]
        #if it has the correct number of values (2 r, 2 g, 2 b)
        if len(hexVal) == 6:
            try:
                #manually split up the string into each value and convert to hex
                r = int(hexVal[0] + hexVal[1], 16)
                g = int(hexVal[2] + hexVal[3], 16)
                b = int(hexVal[4] + hexVal[5], 16)
                return (r, g, b)
            except:
                print("hex2dec: ", hexVal, " doesn't contain hex that can be converted")
                return False
        else:
            print("hex2dec: size of ", hexVal, " is incorrect for color conversion")
            return False
    else:
        print("hex2dec: type of ", hexVal, " is incorrect for color conversion")
        return False
