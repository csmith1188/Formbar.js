class Session {
    constructor(ip = "0.0.0.0") {
      this.refresh();
      this.ip = ip;
      this.studentDict = {};
      this.mainPage = "/home";
      this.pollType = null;
      this.pollID = 1;
      this.bgm = {
        "nowplaying": "",
        "lastTime": 0,
        "lastPlayer": "",
        "list": {},
        "volume": 0.5,
        "paused": false
      };
      this.ttt = [];
      this.fighter = {};
      this.settings = {
        "perms": {
          "admin": 0,
          "users": 1,
          "api": 3,
          "sfx": 1,
          "bgm": 1,
          "say": 2,
          "bar": 1,
          "games": 2,
          "teacher": 0,
          "mod": 1,
          "student": 2,
          "anyone": 3,
          "banned": 4
        },
        "permname": ["Teacher", "Mod", "Student", "Guest", "Banned"],
        "locked": false,
        "paused": false,
        "blind": false,
        "showinc": true,
        "captions": true,
        "autocount": true,
        "numStudents": 8,
        "upcolor": "green",
        "wigglecolor": "blue",
        "downcolor": "red",
        "barmode": "playtime",
        "modes": ["poll", "tutd", "abcd", "text", "quiz", "essay", "progress", "playtime"],
        "whitelist": ["127.0.0.1", "172.21.3.5"]
      };
    }
  
    refresh() {
      this.currentStep = 0;
      this.wawdLink = "";
      this.agendaStep = 0;
      this.activePhrase = "";
      this.activePrompt = "";
      this.activeCompleted = "";
      this.activeBar = [];
      this.activeProgress = {};
      this.activeQuiz = {};
      this.lesson = {};
      this.lessonList = {};
    }
  
  }
  
  class Student {
    constructor(username) {
      this.name = username;
      this.help = false;
      this.breakReq = false;
      this.thumb = "";
      this.letter = "";
      this.textRes = "";
      this.progress = [];
      this.perms = 2;
      this.quizResults = {};
      this.preferredHomepage = null;
    }
  
  }
