
function DeezerPlayerUpdateFromBackToPlayer(){

port.onMessage.addListener(function(message,sender){
  if(message.type === "control"){
    window.postMessage({ type: "control", text: message.control }, "*");
  }
  else if(message.type === "tracklist"){
    window.postMessage({ type: "tracklist", text: message.index }, "*");
  }
  else if(message.type === "volume"){
    window.postMessage({ type: "volume", text: message.index }, "*");
  }
});
}

function createController(){
var aDeezerControlDataDom = document.createElement('div');
aDeezerControlDataDom.id = "DeezerControlData";
aDeezerControlDataDom.style.display = 'none';
document.body.appendChild(aDeezerControlDataDom);

// create a child to save the tracklist
var aTracklistDom= document.createElement('div');
aTracklistDom.id = "tracklistControlData";
aDeezerControlDataDom.appendChild(aTracklistDom);

// create a child to monitor and help force the info update
var aLastUpdateDom = document.createElement('div');
aLastUpdateDom.id = "lastUpdate";
aDeezerControlDataDom.appendChild(aLastUpdateDom);

// add a listener for events on our new DIV, and post it to our extension
var observer = new MutationObserver(update);
observer.observe(document.getElementById('lastUpdate'), { attributes: false, childList: true, characterData: true });

var s = document.createElement('script');
	s.src = chrome.extension.getURL('play.js');
	(document.head||document.documentElement).appendChild(s);
	s.onload = function() { "use strict"; s.parentNode.removeChild(s); };



}
function getDeezerData()
{
	"use strict";

	// filter attributes to only keep those we want
	var aAllAttributes = document.getElementById('DeezerControlData').attributes,
		aDzAttributes = {},
    tracklistObject = {},
		i;
	for (i = 0 ; i < aAllAttributes.length; i++)
	{
		if (aAllAttributes[i].name.substring(0, 3) === "dz_")
		{
			if (aAllAttributes[i].value !== undefined)
			{
				aDzAttributes[aAllAttributes[i].name] = aAllAttributes[i].value;
			}
			else
			{
				aDzAttributes[aAllAttributes[i].name] = '';
			}
		}
	}
  var childrenTracks = document.getElementById('tracklistControlData').children
  for (i = 0 ; i < childrenTracks.length; i++){
    var trackAttributes = childrenTracks[i].attributes;
    tracklistObject[i]={};
    for (var j = 0 ; j < trackAttributes.length; j++)
    {
      if (trackAttributes[j].name.substring(0, 3) === "dz_")
      {
        if (trackAttributes[j].value !== undefined)
  			{
  			tracklistObject[i][trackAttributes[j].name] = trackAttributes[j].value;
  			}
  			else
  			{
  				tracklistObject[i][trackAttributes[j].name] = '';
  			}
      }
    }
  }
  aDzAttributes.tracklist = tracklistObject;
	return aDzAttributes;
}

//on player update
function update(){
	DeezerAttributes = getDeezerData();
  //send the update to the background
	port.postMessage({type : "update", deezerObj : DeezerAttributes});

}
var gCheckIfReady = new MutationObserver(function(mutations)
{
	"use strict";

	if (!okForLoad())
		return;
	createController();
	this.disconnect(); // stop observing
});



// do we have the elements needed to work?
function okForLoad()
{
	console.log(document.querySelector(".player-track-link"));
	return document.querySelector(".player-track-link") !== null;
}

function bootstrap()
{

	if (document.readyState !== "complete")
		return;

	// everything might already be loaded
	if (okForLoad())
	{
		createController();
		return;
	}

	// delay insertion until the elements we want are added
	var sidebar = document.getElementById("page_sidebar");
	if (sidebar === null)
	{
		console.log('fail');
		return;

	}
	console.log("good")
	gCheckIfReady.observe(sidebar, { subtree: true, childList: true });
}
var port = chrome.runtime.connect({name:"deezer"});
DeezerPlayerUpdateFromBackToPlayer();
document.addEventListener("readystatechange", bootstrap);
bootstrap(); // for extension reload
