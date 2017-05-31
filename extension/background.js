//Initialize the firebase real-time database and return an instance of it
function firebaseInitialization(){
  var config = {
      apiKey: "AIzaSyD7g4pm0h6Ci8oq3WqvbKnGLm5lD4SbCR4",
      authDomain: "deezapper.firebaseapp.com",
      databaseURL: "https://deezapper.firebaseio.com",
      storageBucket: "deezapper.appspot.com",
      messagingSenderId: "242397221986"
    };
    firebase.initializeApp(config);
    var database = firebase.database();
    return database;
}

function getDeviceName(user){
  chrome.storage.local.get('device_name', function (result) {
        if(result!=null){
          device_name = result.device_name;
        }

          userStatus(user, device_name);


      });

}

function userStatus(user, device_name){
  if (user) {
    // User is signed in.
  uid = user.uid;
  var amOnline = database.ref('.info/connected');
  //alert(device_name);
  var userRef = database.ref('users/' + uid + '/devices/' + device_name + '/connected' );
  //alert('users/' + uid + '/devices/' + device_name + '/connected');
  amOnline.on('value', function(snapshot) {
  if (snapshot.val() == true ) {
    userRef.set(true);
    userRef.onDisconnect().set(false);
  }

  });

  checkSetup();
  DeezerPlayerUpdateFromFirebase();

  } else {
    // No user is signed in.
    uid=null;
      chrome.tabs.create({url: "https://deezapper.firebaseapp.com/serverPortal/"});
  }

}

function checkAuthState(){
  firebase.auth().onAuthStateChanged(function(user) {
    getDeviceName(user);


});

}




function checkSetup(){
  var setup = database.ref('users/'+uid+'/devices/'+device_name+'/setup');
  setup.on('value', function(snapshot) {
  if(snapshot.val()==="launch"){
  var newURL = "http://www.deezer.com";
    openMyTab(newURL);
    setup.set("wait");
  }


  });

}



function openMyTab(mURL) {

    if(!mURL){
       console.log("No url passed");
       return;
    }
  chrome.tabs.query({},function(tabs) {
    for (var i = 0;i<tabs.length; i++) {

      if (tabs[i].url && (tabs[i].url.indexOf(mURL)!=-1)) {

        console.log("URL Match found",tabs[i].url);



        return;
      }
    }
     console.log("URL not found. Creating new tab");

    chrome.tabs.create({url: mURL});
  });
}




function DeezerPlayerUpdateFromFirebase(){

chrome.runtime.onConnect.addListener(function(port){
var control = database.ref('users/'+uid+'/devices/'+device_name+'/controller');
control.on('value', function(snapshot) {

  if(typeof snapshot.val().action === 'string'){

  port.postMessage({type:"control",control:snapshot.val().action});
}
else if(snapshot.val().action.tracklist!=null){
  port.postMessage({type:"tracklist",index:snapshot.val().action.index});
}
else if(snapshot.val().action.volume!=null){
  port.postMessage({type:"volume",index:snapshot.val().action.index});
}


});
DeezerPlayerUpdateToFirebase(port);

});
}
function DeezerPlayerUpdateToFirebase(port){
  port.onMessage.addListener(function(message,sender){
    if(uid!=null){
  	if(message.type === "update"){
  		database.ref('users/'+uid+'/devices/'+device_name+'/deezerControl').update(message.deezerObj);
  	}
  /*	if(message.type === "initialization"){
  		database().ref('users/'+uid).set({
      deezerControl : message.deezerObj,
  	control : ""

    });
  }*/
    }
     });
}

function extensionInitialization(){

  checkAuthState();

}
var uid, device_name;
var database = firebaseInitialization();
extensionInitialization();
