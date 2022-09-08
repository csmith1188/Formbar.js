import pandas#Imports pandas.
import os#Imports operating system.
import pprint
import math
import html

class Lesson():
    def __init__(self):
        self.agenda = []
        self.steps = []
        self.objectives = []
        self.links = []
        self.quizList = {}
        self.progList = {}
        self.results = {}
        self.vocab = {}
    def checkProg(self, studentList):
        complete = [0,0,0]
        for student in studentList:
            for task in studentList[student]['progress']:
                complete[int(task)] += 1
            if not False in studentList[student]['progress']:
                complete[2] += 1
        if complete[1]:
            percAmount = (complete[1]/(complete[0]+complete[1])) * 100
        else:
            percAmount = 0
        return int(percAmount)

lessons = {}

def updateFiles():
    global lessons
    #Empty lessons file list
    lessons = {}
    #Scan folder for all filenames
    availableFiles = os.listdir("./lessondata")
    #Loop through each file
    for file in sorted(availableFiles):
        #Check last five letters are the correct file extension
        if file[-5:] == '.xlsx':
            #Add them to the lessonsFiles list if so
            lessons[file[:-5]] = os.path.dirname(os.path.abspath(__file__)) + "/../lessondata/" + file
    return lessons

def readBook(incBook):
    newBook = 'lessondata/' + incBook + '.xlsx'
    book = pandas.ExcelFile(newBook)
    lD = Lesson()
    for sheet in book.sheet_names:
        if sheet == 'Agenda':
            data = book.parse(sheet).to_dict('index')
            for col in data:
                lD.agenda.append(data[col])
        elif sheet == 'Steps':
            data = book.parse(sheet).to_dict('index')
            for col in data:
                lD.steps.append(data[col])
        elif sheet == 'Objectives':
            data = book.parse(sheet).to_dict('index')
            for col in data:
                lD.objectives.append(data[col])
        elif sheet == 'Resources':
            data = book.parse(sheet).to_dict('index')
            for col in data:
                lD.links.append(data[col])
        elif sheet == 'Vocabulary':
            data = book.parse(sheet).to_dict('index')
            for col in data:
                lD.vocab[data[col]['Word']] = data[col]['Definition']
        elif sheet[0:5] == 'Quiz_':
            data = book.parse(sheet).to_dict()
            quiz = {'name': sheet[5:], 'questions':[], 'keys': [], 'answers': []}
            for row in range(0, len(data['Question'])):
                answers = []
                for i, col in enumerate(data):
                    if i == 1:
                        quiz['questions'].append(data[col][row])
                    elif i == 2:
                        quiz['keys'].append(data[col][row])
                    elif i > 1:
                        answers.append(data[col][row])
                quiz['answers'].append(answers)
            lD.quizList[sheet] = quiz

        elif sheet[0:9] == 'Progress_':
            data = book.parse(sheet).to_dict()
            progress = {'name': sheet[9:], 'task':[], 'desc': []}
            for task in data['Task']:
                if str(data['Task'][task]) == 'nan':
                    progress['task'].append('N/A')
                else:
                    progress['task'].append(html.escape(data['Task'][task]))
            for desc in data['Description']:
                if str(data['Description'][desc]) == 'nan':
                    progress['desc'].append('N/A')
                else:
                    progress['desc'].append(html.escape(data['Description'][desc]))
            lD.progList[sheet] = progress
    pprint.pprint(vars(lD))
    return lD
