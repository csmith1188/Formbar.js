const request = new XMLHttpRequest();
request.open("GET", '/api/ip', false);
request.send(null);
const serverIp = JSON.parse(request.responseText).ip;
const apiSocket = io("/apisocket");
const chatSocket = io("/chat");

chatSocket.on("disconnect", message => {
  console.log("DISCONNECTED:", message);
  //if (message == "transport error") {
    //alert("Session ended.");
    //window.location.reload();
  //}
});

function getResponse(endpoint, parse = true) {
  return new Promise((resolve, reject) => {
    let newRequest = new XMLHttpRequest();
    endpoint += (endpoint.includes("?") ? "&" : "?");
    endpoint += "return=json";
    newRequest.open("GET", endpoint);
    newRequest.onload = () => {
      if (parse) {
        try {
          resolve(JSON.parse(newRequest.responseText));
        } catch {
          resolve({});
        }
      } else {
        resolve(newRequest.responseText);
      }
    };
    newRequest.send(null);
  });
}

const urlParams = new URLSearchParams(window.location.search);

//If the user is on a mobile device, take them to /mobile
if (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) &&
  window.location.pathname != "/mobile" &&
  !(window.location.pathname == "/login" && urlParams.get("forward") == "/mobile") &&
  !(window.location.pathname == "/chat" && urlParams.get("mobile"))
) window.location = "/mobile";
