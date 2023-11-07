const userPremadePolls = JSON.parse('[5,6]')
const classroomPremadePolls = JSON.parse('[5]')
const publicPremadePolls = JSON.parse('[1,2,3,4]')
const premadePolls = JSON.parse('{"1":{"id":1,"owner":null,"name":"TUTD","prompt":"Thumbs?","answers":"[{\"answer\":\"Up\",\"weight\":0.9,\"color\":\"#00FF00\"},{\"answer\":\"Wiggle\",\"weight\":1,\"color\":\"#00FFFF\"},{\"answer\":\"Down\",\"weight\":1.1,\"color\":\"#FF0000\"}]","textRes":0,"blind":0,"weight":1,"public":1},"2":{"id":2,"owner":null,"name":"True/False","prompt":"True or False","answers":"[{\"answer\":\"True\",\"weight\":1,\"color\":\"#00FF00\"},{\"answer\":\"False\",\"weight\":1,\"color\":\"#FF0000\"}]","textRes":0,"blind":0,"weight":1,"public":1},"3":{"id":3,"owner":null,"name":"Done/Ready?","prompt":"Done/Ready?","answers":"[{\"answer\":\"Yes\",\"weight\":1,\"color\":\"#00FF00\"}]","textRes":0,"blind":0,"weight":1,"public":1},"4":{"id":4,"owner":null,"name":"Multiple Choice","prompt":"Multiple Choice","answers":"[{\"answer\":\"A\",\"weight\":1,\"color\":\"#FF0000\"},{\"answer\":\"B\",\"weight\":1,\"color\":\"#0000FF\"},{\"answer\":\"C\",\"weight\":1,\"color\":\"#FFFF00\"},{\"answer\":\"D\",\"weight\":1,\"color\":\"#00FF00\"}]","textRes":0,"blind":0,"weight":1,"public":1},"5":{"id":5,"owner":null,"name":"a","prompt":"Multiple Choice","answers":"[{\"answer\":\"A\",\"weight\":1,\"color\":\"#FF0000\"}]","textRes":0,"blind":0,"weight":1,"public":0},"6":{"id":6,"owner":null,"name":"b","prompt":"Multiple Choice","answers":"[{\"answer\":\"B\",\"weight\":1,\"color\":\"#FF0000\"}]","textRes":0,"blind":0,"weight":1,"public":0}}')

console.log('userPremadePolls', userPremadePolls);
console.log('');
console.log('classroomPremadePolls', classroomPremadePolls);
console.log('');
console.log('publicPremadePolls', publicPremadePolls);
console.log('');
console.log('premadePolls', premadePolls);