


function executeAction(action)
{
	"use strict";
	if (dzPlayer === undefined || dzPlayer.control === undefined)
		return;

	switch (action)
	{
		case 'play':
		if(dzPlayer.isPlaying()==false){
			dzPlayer.control.play();
		}
		else {
			dzPlayer.control.pause();
		}
			break;
		case 'prev':
			dzPlayer.control.prevSong();
			break;
		case 'next':
		console.log("next");
			dzPlayer.control.nextSong();
			break;
		case 'shuffle':
		if(dzPlayer.isShuffle()==false){
		dzPlayer.control.setShuffle(true);
	}
		else{
		dzPlayer.control.setShuffle(false)
		}
		break;
	}
}

function executeActionTracklist(index)
{
	"use strict";
	if (dzPlayer === undefined || dzPlayer.control === undefined)
		return;

	dzPlayer.playTrackAtIndex(index);
}
function executeActionVolume(index)
{
	"use strict";
	if (dzPlayer === undefined || dzPlayer.control === undefined)
		return;

	dzPlayer.control.setVolume(index);
}



window.addEventListener('message', function(event) {
	if (event.source != window)
    return;
	if(event.data.type === 'control'){
		executeAction(event.data.text);
	}
else if(event.data.type === 'tracklist'){
		executeActionTracklist(event.data.text);
	}
	else if(event.data.type === 'volume'){
			executeActionVolume(event.data.text);
		}

});

function GetCoverFromAlbumId(albumId)
{
	"use strict";
	if (albumId === undefined || albumId === null)
		albumId = "";

	return "http://cdn-images.deezer.com/images/cover/" + albumId + "/250x250-000000-80-0-0.jpg";
}
function updateDeezerControlData()
{
	"use strict";
	var DeezerControlData = document.getElementById('DeezerControlData'),
	tracklistData = document.getElementById('tracklistControlData'),
		dzCurrentSong, dzPrevSong, dzNextSong,
		isPlaying = true,
		isPrevActive = dzPlayer.getPrevSong() !== null,
		isNextActive = dzPlayer.getNextSong() !== null;

	try
	{
		dzCurrentSong = dzPlayer.getCurrentSong() || { ALB_PICTURE: '', ART_ID: '', ALB_ID: '' };;
	} catch(e) {}

	try
	{
		dzPrevSong = dzPlayer.getPrevSong() || { ALB_PICTURE: '' };
	} catch(e) {}

	try
	{
		dzNextSong = dzPlayer.getNextSong() || { ALB_PICTURE: '' };
	} catch(e) {}



	isPlaying = dzPlayer.isPlaying();

	DeezerControlData.setAttribute('dz_is_active',   true);
	DeezerControlData.setAttribute('dz_playing',	 isPlaying);
	DeezerControlData.setAttribute('dz_artist',	     dzPlayer.getArtistName());
	DeezerControlData.setAttribute('dz_track',	     dzPlayer.getSongTitle());
	DeezerControlData.setAttribute('dz_index_track', dzPlayer.getIndexSong());
	DeezerControlData.setAttribute('dz_position', dzPlayer.getPosition());
	DeezerControlData.setAttribute('dz_duration', dzPlayer.getDuration());
	DeezerControlData.setAttribute('dz_volume', dzPlayer.getVolume());
	DeezerControlData.setAttribute('dz_shuffle', dzPlayer.isShuffle());
	DeezerControlData.setAttribute('dz_is_liked',	 userData.isFavorite('song', dzCurrentSong.SNG_ID));
	DeezerControlData.setAttribute('dz_artist_id',   dzCurrentSong.ART_ID);
	DeezerControlData.setAttribute('dz_album_id',    dzCurrentSong.ALB_ID);
	DeezerControlData.setAttribute('dz_cover',	     GetCoverFromAlbumId(dzCurrentSong.ALB_PICTURE));
	DeezerControlData.setAttribute('dz_prev_cover',  GetCoverFromAlbumId(dzPrevSong.ALB_PICTURE));
	DeezerControlData.setAttribute('dz_next_cover',  GetCoverFromAlbumId(dzNextSong.ALB_PICTURE));
	DeezerControlData.setAttribute('dz_is_prev_active', isPrevActive);
	DeezerControlData.setAttribute('dz_is_next_active', isNextActive);


	var tracklistArray = dzPlayer.getTrackList();
	tracklistData.innerHTML = "";
	for(var i=0;i<tracklistArray.length;i++){
		var trackArray = tracklistArray[i];
		var track= document.createElement('div');
		track.id = "track"+i;
		tracklistData.appendChild(track);
		track.setAttribute('dz_album_id',trackArray.ALB_ID );
		track.setAttribute('dz_cover',GetCoverFromAlbumId(trackArray.ALB_PICTURE ));
		track.setAttribute('dz_track',trackArray.SNG_TITLE );
		track.setAttribute('dz_artist',trackArray.ART_NAME );
	}



	document.getElementById('lastUpdate').textContent = Math.floor(new Date().getTime());



}

(function()
{
	"use strict";

	// ensure the player is on the page
	if (dzPlayer !== null)
	{
		var player_track_title = $(".player-track-title");
		var player_control_play = $(".control, .icon-love-circle, .icon-love");

		// observe the changes of style attribute of #player_control_play, to track play / pause changes
		// (its style changes from hidden to display)
		// observe the changes of content of #player_track_title, to track song changes
		var observerPlay = new MutationObserver(function(mutations)
		{
			"use strict";

			var bUpdateInfo = false, i, mutation;
			for (i = 0; i < mutations.length && !bUpdateInfo; i++)
			{
				mutation = mutations[i];

				// result of 'player_control_play' observer
				if (mutation.type === "attributes")
				{
					bUpdateInfo  = mutation.oldValue !== mutation.target.getAttribute(mutation.attributeName);
				}
				// result of 'player_track_title' observer
				else if (mutation.type === "characterData" || mutation.type === "childList")
				{
					bUpdateInfo = true;
				}
			}

			if (bUpdateInfo)
			{
				updateDeezerControlData();
			}
		});

		player_track_title.each(function ()  { observerPlay.observe(this, { childList: true, characterData: true, subtree: true }); });
		player_control_play.each(function () { observerPlay.observe(this, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'data-action'] }); });

		// observe change in DOM, and attach observerPlay to all the "love" icons
		var oberserLoveIcons = new MutationObserver(function(mutations)
		{
			$(".icon-love").each(function(){ observerPlay.observe(this, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'data-action'] }); });
		});
		oberserLoveIcons.observe(document, { childList: true, subtree: true });

		updateDeezerControlData();
	}
	// failure to initialize
	else
	{
		alert("dzPlayer is null")
	}
})();
