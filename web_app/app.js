var app = angular.module("DeezapperApp", ["Sidebar","Tracklist","Player","Login","firebase"]);

//re-usable factory that generates the $firebaseAuth instance
app.factory("Auth", ["$firebaseAuth",
  function($firebaseAuth) {
    return $firebaseAuth();
  }
]);

app.filter('toMinSec', function(){
  return function(input){
    var minutes =0;
    var seconds=0;
    if(input!=undefined){
    minutes = parseInt(input/60, 10);
    seconds = input%60;
  }

    return  ('00'+minutes).slice(-2)+':'+('00'+seconds).slice(-2);
  }
})

// and use it in our controller
app.controller("DeezapperCtrl", ["$scope", "Auth","$firebaseObject",

  function($scope, Auth, $firebaseObject) {
$scope.player=true;
  $scope.auth_show = false;
Auth.$onAuthStateChanged(function(user) {
  if(user){
    $scope.auth_show = false;
    $scope.user=user;
    var ref = firebase.database().ref('users/'+user.uid+'/devices');
    var database = $firebaseObject(ref);
    database.$bindTo($scope, "Devices").then(function(unbid){
      $scope.DevicesUnbid=unbid;
    });

$('#loginModal').modal('hide');
   $('.error').removeClass('alert alert-danger');
  }
  else {

    $scope.player=true;
    $scope.auth_show = true;
    $scope.user=null;
    $scope.Deezer = null;
    $scope.tracklist = null;
    $scope.Devices=null;
    $scope.currentDevice=null;
  }

});

 $scope.selectDevice = function(device){

   $scope.currentDevice = device;
   var ref = firebase.database().ref('users/'+$scope.user.uid+'/devices/'+$scope.currentDevice);
   var database = $firebaseObject(ref);
   $scope.player=true;
   database.$bindTo($scope, "Deezer").then(function(){
     $scope.Deezer.setup = "launch";
   }).then(function(unbid){
     $scope.DeezerUnbid=unbid;

     var refLog = firebase.database().ref('log/');
     var databaseLog = $firebaseObject(refLog);
     databaseLog.$bindTo($scope, "Log");


   });

 };
  $scope.Action = function(action){

console.log(action);
    $scope.Deezer.controller.action = action;
    var date = new Date().getTime();
    $scope.Deezer.controller.date = date;
    var actionObj = {"uid":$scope.user.uid,
      "email":$scope.user.email,
      "action" : action};
    $scope.Log[date]=actionObj;
  };
  $scope.tracklistPlay = function(index){
    event.preventDefault();
    if(index!=$scope.Deezer.deezerControl.tracklist.length - 1 ){
      var date = new Date().getTime();
    $scope.Deezer.controller.action = {"tracklist":"play", "index":index};
    $scope.Deezer.controller.date = date;
      var actionObj = {"uid":$scope.user.uid,
        "email":$scope.user.email,
        "action" : {"tracklist":"play", "index":index}};
    $scope.Log[date]=actionObj;
  }
  };

  $scope.VolumeChange = function(volume){
    if(volume!=undefined){
    var date = new Date().getTime();
    $scope.Deezer.controller.action = {"volume":true, "index":volume};
    $scope.Deezer.controller.date = date;
    var actionObj = {"uid":$scope.user.uid,
      "email":$scope.user.email,
      "action" : {"volume":true, "index":volume}};
    $scope.Log[date]= actionObj;
  }
  };


  $scope.signOut = function(){
    /*$scope.DeezerUnbid();
    $scope.DevicesUnbid();*/
    Auth.$signOut();

  };

    $scope.signIn = function (){
$scope.message = null;
    if (Auth.$getAuth()) {
      // [START signout]
  Auth.$signOut();
      // [END signout]
    } else {
      var email = $scope.email;
      var password = $scope.password;
      if (email.length < 4) {
        $scope.message= 'Please enter an email address.';
        return;
      }
      if (password.length < 4) {
        $scope.message='Please enter a password.';
        return;
      }
      // Sign in with email and pass.
      // [START authwithemail]
      Auth.$signInWithEmailAndPassword(email, password).catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        // [START_EXCLUDE]
        if (errorCode === 'auth/wrong-password') {
          $scope.message = "Wrong password";
        } else {
          $scope.message =errorMessage;
        }
        console.log(error);
        $('.error').addClass('alert alert-danger');


        // [END_EXCLUDE]
      });
      // [END authwithemail]

    }
  };
  }
]);
