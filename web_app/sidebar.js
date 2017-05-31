var app = angular.module("Sidebar", []);

app.directive('sidebarNav', function(){
  return {
    restrict: 'E',
    templateUrl:'sidebar.html',
    controller:function(){

    }
  };
});
