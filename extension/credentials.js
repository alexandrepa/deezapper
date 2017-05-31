// TODO(DEVELOPER): Change the values below using values from the initialization snippet: Firebase Console > Overview > Add Firebase to your web app.
// Initialize Firebase
var config = {
    apiKey: "AIzaSyD7g4pm0h6Ci8oq3WqvbKnGLm5lD4SbCR4",
    authDomain: "deezapper.firebaseapp.com",
    databaseURL: "https://deezapper.firebaseio.com",
    storageBucket: "deezapper.appspot.com",
    messagingSenderId: "242397221986"
  };
firebase.initializeApp(config);

    /**
     * Handles the sign in button press.
     */
    function toggleSignIn() {
      if (firebase.auth().currentUser) {
        // [START signout]
        firebase.auth().signOut();
        // [END signout]
      } else {
        var email = document.getElementById('email').value;
        var password = document.getElementById('password').value;
        if (email.length < 4) {
          alert('Please enter an email address.');
          return;
        }
        if (password.length < 4) {
          alert('Please enter a password.');
          return;
        }
        // Sign in with email and pass.
        // [START authwithemail]
        firebase.auth().signInWithEmailAndPassword(email, password).catch(function(error) {
          // Handle Errors here.
          var errorCode = error.code;
          var errorMessage = error.message;
          // [START_EXCLUDE]
          if (errorCode === 'auth/wrong-password') {
            alert('Wrong password.');
          } else {
            alert(errorMessage);
          }
          console.log(error);
          document.getElementById('quickstart-sign-in').disabled = false;
          // [END_EXCLUDE]
        });
        // [END authwithemail]
      }
      document.getElementById('quickstart-sign-in').disabled = true;
    }
    /**
     * Handles the sign up button press.
     */
    function handleSignUp() {
      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;
      var device_name = document.getElementById('device_name').value;
      if (email.length < 4) {
        alert('Please enter an email address.');
        return;
      }
      if (password.length < 4) {
        alert('Please enter a password.');
        return;
      }

     chrome.storage.local.set({'device_name': device_name}, function() {
         // Notify that we saved.

       });
      // Sign in with email and pass.
      // [START createwithemail]
      firebase.auth().createUserWithEmailAndPassword(email, password).then(function(user){
		  var uid = firebase.auth().currentUser.uid;

		 firebase.database().ref('users/'+firebase.auth().currentUser.uid).set({
	  "devices": {
		  [device_name] : {
			  "connected" : true,
        "setup" : "wait",
        "deezerControl": "",
        "controller": {
          "action" : "",
          "date":""
        }
		  }
	  }

});
	  }).catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        // [START_EXCLUDE]
        if (errorCode == 'auth/weak-password') {
          alert('The password is too weak.');
        } else {
          alert(errorMessage);
        }
        console.log(error);
        // [END_EXCLUDE]
      });
      // [END createwithemail]
    }
    /**
     * Sends an email verification to the user.
     */
    function sendEmailVerification() {
      // [START sendemailverification]
      firebase.auth().currentUser.sendEmailVerification().then(function() {
        // Email Verification sent!
        // [START_EXCLUDE]
        alert('Email Verification Sent!');
        // [END_EXCLUDE]
      });
      // [END sendemailverification]
    }
    function sendPasswordReset() {
      var email = document.getElementById('email').value;
      // [START sendpasswordemail]
      firebase.auth().sendPasswordResetEmail(email).then(function() {
        // Password Reset Email Sent!
        // [START_EXCLUDE]
        alert('Password Reset Email Sent!');
        // [END_EXCLUDE]
      }).catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        // [START_EXCLUDE]
        if (errorCode == 'auth/invalid-email') {
          alert(errorMessage);
        } else if (errorCode == 'auth/user-not-found') {
          alert(errorMessage);
        }
        console.log(error);
        // [END_EXCLUDE]
      });
      // [END sendpasswordemail];
    }
    /**
     * initApp handles setting up UI event listeners and registering Firebase auth listeners:
     *  - firebase.auth().onAuthStateChanged: This listener is called when the user is signed in or
     *    out, and that is where we update the UI.
     */
    function initApp() {
      // Listening for auth state changes.
      // [START authstatelistener]
      firebase.auth().onAuthStateChanged(function(user) {

        if (user) {
          // User is signed in.
          htmlConnected();

          var displayName = user.displayName;
          var email = user.email;
          document.getElementById('user').textContent = email;
          var emailVerified = user.emailVerified;
          var photoURL = user.photoURL;
          var isAnonymous = user.isAnonymous;
          var uid = user.uid;
          var providerData = user.providerData;
          // [START_EXCLUDE silent]
          document.getElementById('quickstart-sign-in-status').textContent = 'Signed in';
          document.getElementById('quickstart-sign-in').textContent = 'Sign out';
          document.getElementById('quickstart-account-details').textContent = JSON.stringify(user, null, '  ');
          if (!emailVerified) {
            document.getElementById('quickstart-verify-email').disabled = false;
          }
          // [END_EXCLUDE]



        } else {
          // User is signed out.
          htmlSignIn();
          // [START_EXCLUDE silent]
          document.getElementById('quickstart-sign-in-status').textContent = 'Signed out';
          document.getElementById('quickstart-sign-in').textContent = 'Sign in';
          document.getElementById('quickstart-account-details').textContent = 'null';
          // [END_EXCLUDE]


        }
        // [START_EXCLUDE silent]
        document.getElementById('quickstart-sign-in').disabled = false;
        // [END_EXCLUDE]
      });
      // [END authstatelistener]
      document.getElementById('quickstart-sign-in').addEventListener('click', toggleSignIn, false);
      document.getElementById('quickstart-sign-up').addEventListener('click', handleSignUp, false);
      document.getElementById('quickstart-password-reset').addEventListener('click', sendPasswordReset, false);
      document.getElementById('createAccount').addEventListener('click', htmlSignUp, false);
      document.getElementById('info').addEventListener('click', openIndex, false);
    }
    window.onload = function() {
      initApp();
    };


    function htmlSignIn(){
     document.getElementById("email").style.display = "inline";
     document.getElementById("password").style.display = "inline";
     document.getElementById("quickstart-sign-in").style.display = "block";
     document.getElementById("create").style.display = "block";
     document.getElementById("quickstart-sign-up").style.display = "none";
     document.getElementById("device_name").style.display = "none";
      document.getElementById("connected").style.display = "none";


    }

    function htmlSignUp(){
     document.getElementById("email").style.display = "inline";
     document.getElementById("password").style.display = "inline";
     document.getElementById("quickstart-sign-in").style.display = "none";
     document.getElementById("create").style.display = "none";
     document.getElementById("quickstart-sign-up").style.display = "block";
     document.getElementById("device_name").style.display = "inline";
     document.getElementById("connected").style.display = "none";
     document.getElementById("title_pop").innerHTML = "Join us";


    }

    function htmlConnected(){

      chrome.storage.local.get('device_name', function (result) {
            if(result!=null){
              device_name = result.device_name;
              document.getElementById('device').textContent = 'This computer name is : '+device_name;
            }
          });

      document.getElementById("email").style.display = "none";
      document.getElementById("password").style.display = "none";
      document.getElementById("quickstart-sign-in").style.display = "block";
      document.getElementById("create").style.display = "none";
      document.getElementById("quickstart-sign-up").style.display = "none";
      document.getElementById("device_name").style.display = "none";
       document.getElementById("connected").style.display = "block";
       document.getElementById("title_pop").style.display = "none";

    }
    function openIndex(){
        chrome.tabs.create({url: "https://deezapper.firebaseapp.com/serverPortal/"});
    }
