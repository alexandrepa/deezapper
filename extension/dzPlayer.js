import $ from 'jquery';
import getSize from 'lodash.size';
import getDeepKey from 'lodash.get';

// Modules
import logger from '../core/logger';
import Events from '@deezer/modules/Events';
import api from '@deezer/modules/api';
import {shuffle} from '@deezer/modules/utils';
import error from '../core/error';
import modal from '../core/modal';
import Track from '@deezer/modules/models/Track';
import userData from '@deezer/modules/userData';
import right from '@deezer/modules/right';
import config from '@deezer/modules/config';

function _executeActionscriptMethod(swfId, method, params) {
	const swf = document.getElementById(swfId);
	if (swf === null || typeof swf.callAS !== 'function') {
		logger.error('swf not accessible', {
			description: 'executeActionscriptMethod: / swfId ' + swfId
		});
		return;
	}
	swf.callAS(method, params);
}

// This is a private version of dzPlayer. No One can access it except dzPlayer and trackList
let _dzPlayer = {
	trackList: [],
	trackListOriginal: [],
	trackListIndex: 0,
	trackListDuration: 0,
	lyrics: {}
};

let _dzPlayerEvents = {

	queue: [],

	delayed: null,

	trigger: function(evt_name, arg) {
		if (_dzPlayerEvents.delayed !== null) {
			clearTimeout(_dzPlayerEvents.delayed);
		}

		_dzPlayerEvents.queue.push({evt_name: evt_name, arg: arg});
		_dzPlayerEvents.delayed = setTimeout(_dzPlayerEvents.triggerAll, 0);
	},

	triggerAll: function() {
		for (let i = 0; i < _dzPlayerEvents.queue.length; i++) {
			Events.trigger(_dzPlayerEvents.queue[i].evt_name, _dzPlayerEvents.queue[i].arg);
		}

		_dzPlayerEvents.queue = [];
		clearTimeout(_dzPlayerEvents.delayed);
		_dzPlayerEvents.delayed = null;
	}
};

// This is an helper object for manipulation of _dzPlayer.trackList / _dzPlayer.trackListOriginal / index / etc...
let _trackList = {

	setIndex: function(index) {

		if (index < 0 || index > _dzPlayer.trackList.length - 1) {
			index = 0;
		}

		_dzPlayer.trackListIndex = index;
	},

	calculateDuration: function() {
		try {
			_dzPlayer.trackListDuration = 0;

			var limit = _dzPlayer.recommendationsIndex || _dzPlayer.trackList.length;
			for (var t = 0; t < limit; t++) {
				_dzPlayer.trackListDuration += parseInt(_dzPlayer.trackList[t].data.DURATION, 10);
			}

			return _dzPlayer.trackListDuration;
		} catch (e) {
			error.log(e);
		}
	},

	reIndexWithSngId: function(sng_id) {
		let i;
		for (i = 0; i < _dzPlayer.trackList.length; i++) {
			if (_dzPlayer.trackList[i].data.SNG_ID === sng_id) {
				_dzPlayer.trackListIndex = i;
				break;
			}
		}
		return i < _dzPlayer.trackList.length;
	},

	getOriginalIndexWithSngId: function(sng_id) {
		let index = 0;
		for (let i = 0; i < _dzPlayer.trackListOriginal.length; i++) {
			if (_dzPlayer.trackListOriginal[i].data.SNG_ID === sng_id) {
				index = i;
				break;
			}
		}

		return index;
	},

	order: function(order) {
		if (_dzPlayer.trackList.length !== order.length) {
			return false;
		}

		const current_song_id = dzPlayer.getCurrentSong('MEDIA_ID');

		let newTrackList = [];
		for (let o = 0; o < order.length; o++) {
			const sng_id = order[o];

			for (let i = 0; i < _dzPlayer.trackList.length; i++) {
				if (_dzPlayer.trackList[i].data.SNG_ID == sng_id) {
					newTrackList.push(_dzPlayer.trackList[i]);
				}
			}
		}

		if (newTrackList.length !== _dzPlayer.trackList.length) {
			return false;
		}

		_dzPlayer.trackList = newTrackList.slice();

		// Recalculate the right index
		_trackList.reIndexWithSngId(current_song_id);

		_trackList.emitChange({
			type: 'order'
		});

		return true;
	},

	remove: function(index, length) {

		if (index < 0 || index > _dzPlayer.trackList.length - 1) {
			return false;
		}

		if (length === undefined) {
			length = 1;
		} else if (length <= 0) {
			return false;
		}

		if (index < _dzPlayer.trackListIndex) {
			_dzPlayer.trackListIndex--;
		}

		const removed_tracks = _dzPlayer.trackList.splice(index, length);

		if (removed_tracks.length !== 0) {
			const removed_track_id = removed_tracks[0].data.SNG_ID;
			const original_index = _trackList.getOriginalIndexWithSngId(removed_track_id);
			_dzPlayer.trackListOriginal.splice(original_index, length);
		}

		_trackList.calculateDuration();
		_trackList.emitChange({type: 'remove', song: removed_tracks});

		return true;
	},

	shuffle: function(index_first_track) {

		// Default -1 for btn shuffle
		index_first_track = typeof index_first_track === 'number' ? index_first_track : _dzPlayer.trackListIndex;

		_dzPlayer.trackListOriginal = _dzPlayer.trackList.slice();

		const current_song_id = dzPlayer.getCurrentSong('MEDIA_ID');
		const next_song = dzPlayer.getNextSong();

		let first_track = null;
		let sponsored_track = null;

		if (index_first_track !== -1) {
			first_track = _dzPlayer.trackList.splice(index_first_track, 1);
			first_track = first_track.length === 0 ? null : first_track[0];

			if (dzPlayer.helper.isSponsoredTrack(next_song)) {
				sponsored_track = _dzPlayer.trackList.splice(index_first_track, 1);
				sponsored_track = sponsored_track.length === 0 ? null : sponsored_track[0];
			}
		}

		shuffle(_dzPlayer.trackList);

		if (sponsored_track !== null) {
			_dzPlayer.trackList.unshift(sponsored_track);
		}

		if (first_track !== null) {
			_dzPlayer.trackList.unshift(first_track);
		}

		// Recalculate the right index
		_trackList.reIndexWithSngId(current_song_id);

		_trackList.emitChange({type: 'shuffle'});

		return true;
	},

	unShuffle: function() {

		const current_song_id = dzPlayer.getCurrentSong('MEDIA_ID');

		_dzPlayer.trackList = _dzPlayer.trackListOriginal.slice();

		// Recalculate the right index
		_trackList.reIndexWithSngId(current_song_id);

		_trackList.emitChange({type: 'unShuffle'});

		return true;
	},

	// Add next in current trackList, then do the same for trackListOriginal with the right index
	addNext: function(new_tracklist, caller) {
		caller = caller || 'user';

		if (new_tracklist.length === 0) {
			return false;
		}

		if (chromecast.isActive()) {
			return;
		}

		// Check for sponsored track
		var isSponsoredTrack = false;

		if (new_tracklist.length === 1) {
			isSponsoredTrack = dzPlayer.helper.isSponsoredTrack(new_tracklist[0].data);
		}

		if (dzPlayer.isRadio() && !isSponsoredTrack) {
			return false;
		}

		var current_song_id = dzPlayer.getCurrentSong('MEDIA_ID');
		var next_song = dzPlayer.getNextSong();
		var tracklist_index = _dzPlayer.trackListIndex;
		var tracklistoriginal_index = _trackList.getOriginalIndexWithSngId(current_song_id);

		if (next_song && dzPlayer.helper.isSponsoredTrack(next_song)) {
			tracklist_index++;
			tracklistoriginal_index = _trackList.getOriginalIndexWithSngId(next_song.SNG_ID);
		}

		Array.prototype.splice.apply(_dzPlayer.trackList, [tracklist_index + 1, 0].concat(new_tracklist));

		if (current_song_id > 0) {
			Array.prototype.splice.apply(_dzPlayer.trackListOriginal, [tracklistoriginal_index + 1, 0].concat(new_tracklist));
		} else {
			// We dont care, this isnt normal !
			_dzPlayer.trackListOriginal = _dzPlayer.trackList.slice();
		}

		_trackList.calculateDuration();
		_trackList.emitChange({type: 'addNext', song: new_tracklist, caller: caller});

		return true;
	},

	// Add to queue in trackList and in trackListOriginal. In order to keep the tracks in the end after a unShuffle
	addToQueue: function(new_tracklist, caller) {
		caller = caller || 'user';

		if (new_tracklist.length === 0) {
			return false;
		}

		if (chromecast.isActive()) {
			return;
		}

		_dzPlayer.trackList = _dzPlayer.trackList.concat(new_tracklist);
		_dzPlayer.trackListOriginal = _dzPlayer.trackListOriginal.concat(new_tracklist);

		_trackList.calculateDuration();

		var change_evt = {
			type: 'addToQueue',
			song: new_tracklist,
			caller: caller
		};
		if (dzPlayer.isRadio()) {
			change_evt.type = 'lazyLoad';
		}

		_trackList.emitChange(change_evt);

		return true;

	},

	set: function(new_tracklist, options) {

		options = options || {};

		if (typeof options.addNext === 'boolean' && options.addNext) {
			return _trackList.addNext(new_tracklist, options.caller);
		}

		if (typeof options.addQueue === 'boolean' && options.addQueue) {
			return _trackList.addToQueue(new_tracklist, options.caller);
		}

		// Replace Full
		_dzPlayer.trackList = new_tracklist;
		_dzPlayer.trackListOriginal = _dzPlayer.trackList.slice();

		_trackList.calculateDuration();
		_trackList.emitChange({type: 'set'});

		return true;
	},

	save: function(options) {
		if (options.addQueue || options.addNext) {
			return false;
		}

		if (options.id == dzPlayer.getContext('ID') && options.type === config.get('LOG_CONTEXT')[dzPlayer.getContext('TYPE')]) {
			return false;
		}

		_trackList.backup = {
			trackList: dzPlayer.getTrackList(false),
			trackListIndex: _dzPlayer.trackListIndex,
			trackOffset: dzPlayer.position,
			radio: dzPlayer.getPlayerType() === 'radio',
			context: dzPlayer.getContext()
		};
	},

	restore: function() {

		if (chromecast.isActive()) {
			return;
		}

		if (getSize(_trackList.backup) === 0) {
			return false;
		}

		if (dzPlayer.getPlayerType() === 'ads') {
			Events.subscribeOnce(Events.player.finishAds, dzPlayer.restoreTrackList);
			return false;
		}

		dzPlayer.play({
			data: _trackList.backup.trackList,
			index: _trackList.backup.trackListIndex,
			offset: _trackList.backup.trackOffset,
			context: _trackList.backup.context,
			autoplay: _trackList.backup.trackOffset > 0,
			radio: _trackList.backup.radio,
			saveCurrentTrackList: false
		});

		_trackList.backup = {};

	},

	first_list_already_set: false,

	emitChange: function(data) {
		if (data.type === 'set' && !_trackList.first_list_already_set) {
			_trackList.first_list_already_set = true;
			data.first = true;
		}

		if (data.type === 'set') {
			_dzPlayerEvents.trigger(Events.player.tracklistReset, data);
		}

		_dzPlayerEvents.trigger(Events.player.tracklist_changed, data);
	}

};

let dzPlayer = {

	MEDIA_TYPE_TALK: 'talk',
	MEDIA_TYPE_SONG: 'song',
	MEDIA_TYPE_EXTERNAL: 'external',
	MEDIA_TYPE_LIVE_STREAM: 'live_stream',

	LOG_INTERVAL_LIVE_STREAM: 300,
	LOG_UID: 0,

	SUPPORTED_CODECS: ['mp3'],

	trackType: {
		NONE: -1,
		DEEZER: 0,
		USER: 1,
		AD: 2,
		TALK: 3,
		EXTERNAL: 4,
		LIVE_STREAM: 5
	},

	repeatLevel: {
		REPEAT_OFF: 0,
		REPEAT_ALL: 1,
		REPEAT_SINGLE: 2
	},

	minimumFlashVersion: 10.1,

	volume: 0.5,
	cover: '',
	songId: 0,
	muted: false,
	paused: false,
	playing: false,
	loading: false,
	lastPosition: 0,
	position: 0,
	duration: 0,
	fade: 0,
	repeat: 0,
	shuffle: false,
	pourcentLoaded: 0,
	nextSongInfo: [],
	playerType: 'mod',
	previousPlayerType: 'mod',
	fadeOutProgress: false,
	fadeInProgress: false,
	hq: false,
	numSong: -1,
	nbSongs: -1,
	playerLoaded: false,
	audioAds: null,
	previousSkipAction: '',
	appId: 0,
	appType: '',
	radioType: '',
	radioSkipInterval: 3600000,
	radioSkipIntervalId: 0,
	radioSkipCounter: 0,
	cached: {},

	// Private var
	context: {},

	logTrackTemplate: {
		media: {
			id: 0,
			type: 0
		},
		type: 0,
		stat: {
			seek: 0,
			pause: 0
		},
		lt: 0,
		ctxt: {},
		payload: {},
		dev: {
			v:
			config.get('STATIC_VERSION'),
			t: 0
		},
		ls: [],
		ts_listen: 0
	},
	logTrack: {},
	user_status: {},

	// --------------------------------------------------------------------------
	//
	//  Private methods
	//
	// --------------------------------------------------------------------------
	_play: function(autoPlay, naturalEnd) {
		try {

			if (dzPlayer.getCurrentSong() === null) {
				return false;
			}

			if (dzPlayer.getAudioAds() != null &&
				dzPlayer.getPlayerType() != 'ads' &&
				dzPlayer.isAdvertisingAllowed() &&
				config.get('USER.OPTIONS.ads_audio')) {

				// PLAY AUDIO ADS
				_dzPlayer.trackListIndex--;
				dzPlayer._playAudioAds();
				return false;
			}

			if (dzPlayer.getCurrentSong('TYPE') == 'JINGLE') {
				// PLAY RADIO JINGLE
				dzPlayer._playAudioJingle();
				return false;
			}

			// PLAY NORMAL TRACK

			// If talk content, get current bookmark
			if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_TALK) {
				const mark = userData.getEpisodeBookmark(_dzPlayer.trackList[_dzPlayer.trackListIndex].data.EPISODE_ID);
				// If there is a natural transition, or the user hit next... And the episode is heard, then skip it
				if (typeof naturalEnd !== 'undefined' && mark.IS_HEARD === '1') {
					if (dzPlayer.isLastSong()) {
						dzPlayer.control.pause();
					} else {
						dzPlayer.control.nextSong();
					}
				}

				_dzPlayer.trackList[_dzPlayer.trackListIndex].data.OFFSET = mark.OFFSET;
			}

			if (dzPlayer.getNbSongs() === 0) {
				return false;
			}

			if (typeof autoPlay !== 'boolean') {
				autoPlay = true;
			}

			if (typeof naturalEnd !== 'boolean') {
				naturalEnd = false;
			}

			if (dzPlayer.getPlayerType() === 'ads' ||
				dzPlayer.getPlayerType() === 'jingle') {

				return false;
			}

			if (autoPlay) {
				dzPlayer.LOG_UID = util.uniqid();
				dzPlayer.logManager();

				dzPlayer.trigger('audioPlayer_' + ((naturalEnd && dzPlayer.fade > 0) ? 'appendTracks' : 'playTracks'), [[dzPlayer.getCurrentSong()], 0, autoPlay]);

				Events.trigger(Events.player.notify, 'start');
				Events.trigger(Events.player.play, {value: dzPlayer.getCurrentSong()});

				dzPlayer.duration = (dzPlayer.isLimited()) ? 30 : dzPlayer.getCurrentSong('DURATION');
				Events.trigger(Events.player.duration, dzPlayer.duration);

			} else {
				dzPlayer.trigger('audioPlayer_stop', []);
			}

			delete _dzPlayer.trackList[_dzPlayer.trackListIndex].data.OFFSET;

			_dzPlayerEvents.trigger(Events.player.displayCurrentSong, dzPlayer.getCurrentSong());

			if (dzPlayer.isRadio() && _dzPlayer.trackList.length - _dzPlayer.trackListIndex == 4 && _dzPlayer.trackListIndex > 0) {
				dzPlayer.loadTracks({
					id: dzPlayer.getContext('ID'),
					type: dzPlayer.getRadioType(),
					radio: true,
					addQueue: true,
					context: dzPlayer.getContext()
				});
			}

			if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM) {
				dzPlayer.fingerprintSubscribe();
			}

		} catch (e) {
			error.log(e);
		}
	},

	_playAudioJingle: function() {
		try {
			dzPlayer.previousPlayerType = dzPlayer.getPlayerType();

			dzPlayer.trigger('setAudioJingle', [{
				audio: {
					url: config.get('SETTING_STATIC') + '/' + dzPlayer.getCurrentSong('URL'),
					duration: dzPlayer.getCurrentSong('DURATION')
				},
				format: {formatType: ''},
				content: {urlContent: ''},
				tracking: {
					clickCommand: '',
					clickTagMethod: '',
					pixelAgence: ''
				},
				textlink: {text: ''}
			}]);

			_dzPlayerEvents.trigger(Events.player.displayCurrentSong, dzPlayer.getCurrentSong());
			dzPlayer.setPlayerType('jingle');

		} catch (e) {
			error.log(e);
		}
	},

	_playAudioAds: function() {
		try {
			dzPlayer.previousPlayerType = dzPlayer.getPlayerType();
			dzPlayer.trigger('setAudioAds', [dzPlayer.getAudioAds()]);
			dzPlayer.setPlayerType('ads');
		} catch (e) {
			error.log(e);
		}
	},

	// --------------------------------------------------------------------------
	//
	//  Public methods
	//
	// --------------------------------------------------------------------------
	initSoPlayer: function(div_id) {
		try {
			let path = 'swf/coreplayer3-v' + config.get('STATIC_VERSION') + '.swf';
			if (typeof config.get('RESSOURCES') === 'object') {
				path = config.get('RESSOURCES.coreplayer3');
			}

			// Chrome (>=53) block the small swf by default :
			// https://chromium.googlesource.com/chromium/src.git/+/master/content/renderer/peripheral_content_heuristic.cc#18
			// But Safari do the contrary...
			const playerSize = BrowserDetect.browser === 'Chrome' ? '400' : '1';

			let so = new SWFObject(config.get('SETTING_STATIC') + '/' + path, 'audioPlayerSWF', playerSize, playerSize, dzPlayer.minimumFlashVersion.toString(), '#3a3a3a');
			so.addVariable('host_stream_cdn', config.get('HOST_STREAM_CDN'));
			so.addVariable('host_stream', config.get('HOST_STREAM'));
			so.addVariable('host_preview', config.get('HOST_PREVIEW'));
			so.addVariable('cdn_ratio', config.get('CDN_RATIO'));
			so.addVariable('range_qs', 'x-bits-range');
			so.addVariable('allow_range', 'true');
			so.addVariable('offline', config.get('OFFLINE'));
			so.addVariable('token', config.get('PLAYER_TOKEN'));
			so.addVariable('server_timestamp', config.get('SERVER_TIMESTAMP'));

			so.addParam('wmode', 'transparent');
			so.addParam('allowScriptAccess', 'always');
			so.addParam('menu', 'false');
			so.addParam('hasPriority', 'true');
			so.write(div_id);

			return true;
		} catch (e) {
			error.log(e);
		}
	},

	initRestriction: function() {
		try {
			dzPlayer.setOffline(config.get('OFFLINE'));
			return true;
		} catch (e) {
			error.log(e);
		}
	},

	setUserLogged: function(userId, md5, blogName, sid, gender, age, player_token) {
		try {
			dzPlayer.trigger('audioPlayer_setToken', [player_token]);
			return true;
		} catch (e) {
			error.log(e);
		}
	},

	setUserUnlogged: function() {
		try {
			dzPlayer.trigger('audioPlayer_setToken', ['']);
			return true;

		} catch (e) {
			error.log(e);
		}
	},

	setEmptyPlayer: function() {
		try {
			if (chromecast.isActive()) {
				return;
			}

			if (dzPlayer.getPlayerType() == 'ads' || dzPlayer.getPlayerType() == 'jingle') {
				return false;
			}

			_dzPlayer.trackList	= [];
			_dzPlayer.trackListOriginal = [];
			_dzPlayer.trackListIndex = 0;

			dzPlayer.trigger('audioPlayer_playTracks', [[], 0, false]);

			_dzPlayerEvents.trigger(Events.player.displayEmptyPlayer);

			return false;
		} catch (e) {
			error.log(e);
		}
	},

	play: function(options) {
		try {
			if (chromecast.isLoading()) {
				return;
			}


			if (typeof options.context !== 'object' || Object.keys(options.context).length === 0) {
				logger.debug('Player - Empty context', options);
			}

			options = $.extend(true, {}, {
				type: '',
				id: 0,
				radio: false,
				index: 0,
				autoplay: true,
				context: {ID: '', TYPE: '', CONTEXT_ID: ''},
				data: [],
				offset: 0,
				addNext: false,
				addQueue: false,
				saveCurrentTrackList: true,
				callbackTrack: function() {}
			}, options);

			if (gatekeeper.isAllowed('business') && options.type === 'planning') {
				Events.trigger(Events.business.planningPlay, options.id);
				return false;
			}

			if (gatekeeper.isAllowed('business_mod') && options.radio === true) {
				const action = options.type === 'user' ? 'play_flow' : 'play_radio';
				modal.open(`/lightbox/business_warning?action=${action}`);
			}

			if (dzPlayer.getPlayerType() == 'ads' || dzPlayer.getPlayerType() == 'jingle') {
				return false;
			}

			if (options.data.length === 0) {
				dzPlayer.loadTracks(options);
				return false;
			}

			if (Number(dzPlayer.appId) > 0 && dzPlayer.appType === 'inapp') {
				options.context.ID = dzPlayer.appId;
				options.context.TYPE = dzPlayer.appType;
			}

			if (options.saveCurrentTrackList) {
				_trackList.save(options);
			}

			if (options.index > options.data.length) {
				options.index = 0;
			}

			if (
				gatekeeper.isAllowed('business_mod') &&
				dzPlayer.getContext() &&
				typeof dzPlayer.getContext().TYPE !== 'undefined' &&
				dzPlayer.getContext().TYPE === 'planning' &&
				typeof options.context.TYPE !== 'undefined' &&
				options.context.TYPE === 'planning'
			) {
				dzPlayer.setPlayerType('planning');
			} else {
				dzPlayer.setPlayerType(options.radio ? 'radio' : 'mod');
			}

			if (options.radio === true && options.addQueue === false && options.addNext === false) {
				dzPlayer.radioStartListen(options.id, options.type);
			}

			if (chromecast.isCasting()) {
				options.playOnChromecast = true;
			}

			if (dzPlayer.liveStreamChannel) {
				live.deleteChannel(dzPlayer.liveStreamChannel);
				Events.unsubscribe(Events.live.livestream, dzPlayer.onGetLiveStreamTrack);
				dzPlayer.liveStreamChannel = false;
			}

			if (options.type === 'livestream') {
				dzPlayer.setPlayerType('radio');
				options.data = dzPlayer.getLivestreamData(options.data[0]);
			}

			dzPlayer.radioSkipSetTimer();
			dzPlayer.setTrackList(options, options.addQueue, options.addNext);
			dzPlayer.setTrackListType(options.type);
			dzPlayer.setNbSongsTotal(options.total);

		} catch (e) {
			error.log(e);
		}
	},

	loadTracks: function(options) {
		try {
			if (options.id === 0) {
				logger.debug('Player - play without id', options);
			}

			if (options.type === '') {
				logger.debug('Player - play without type', options);
			}

			if (options.type === 'track' && !$.isArray(options.id)) {
				options.id = [options.id];
			}

			var start = options.start || 0;

			let loader = {
				livestream: {
					api_method: 'livestream.getData',
					api_param: {livestream_id: options.id, supported_codecs: ['mp3']}
				},
				playlist: {
					api_method: 'playlist.getSongs',
					api_param: {playlist_id: options.id, start: start, nb: 1000}
				},
				album: {
					api_method: 'song.getListByAlbum',
					api_param: {alb_id: options.id, start: start, nb: 500}
				},
				track: {
					api_method: 'song.getListData',
					api_param: {sng_ids: options.id}
				},
				radio: {
					api_method: 'radio.getSongs',
					api_param: {radio_id: options.id}
				},
				artist: {
					api_method: options.radio === true ? 'smart.getSmartRadio' : 'song.getTopArtist',
					api_param: {art_id: options.id}
				},
				user: {
					api_method: 'radio.getUserRadio',
					api_param: {user_id: options.id}
				},
				show: {
					api_method: 'episode.getListByShow',
					api_param: {show_id: options.id}
				},
				episode: {
					api_method: 'episode.getData',
					api_param: {episode_id: options.id}
				},
				loved: {
					api_method: 'favorite_song.getList',
					api_param: {user_id: options.id, start: start, nb: 1000}
				},
				favorite: {
					api_method: 'favorite_song.getList',
					api_param: {user_id: options.id, start: start, nb: 1000}
				},
				history: {
					api_method: 'user.getSongsHistory',
					api_param: {start: start, nb: 1000}
				},
				personal_song: {
					api_method: 'personal_song.getList',
					api_param: {start: start, nb: 1000}
				},
				downloads: {
					api_method: 'store.getList',
					api_param: {start: start, nb: 1000, order: 7}
				},
				search: {
					api_method: 'search.music',
					api_param: {query: options.id, start: start, nb: 1000, filter: 'ALL', output: 'TRACK'}
				},
				searchTag: {
					api_method: 'search.music',
					api_param: {query: options.id, start: start, nb: 1000, filter: 'TAG', output: 'TRACK'}
				},
				artistTopTracks: {
					api_method: 'artist.getTopTrack',
					api_param: {art_id: options.id, start: start, nb: 100}
				}
			};

			// Aliases
			loader.talkShow = loader.show;
			loader.collaborativePlaylist = loader.playlist;
			loader.curatorPlaylist = loader.playlist;
			loader.personalPlaylist = loader.playlist;
			loader.topArtist = loader.artistTopTracks;
			loader.discographyArtist = loader.album;

			// NOTE Temporary talk episodes exception to make launch date, until a service can be written.
			if (options.type === 'talkEpisodes') {
				const latestEpisodes = userData.data.FAVORITES_SHOWS.data.map(function(show) {
					return show.LATEST_EPISODE.data[0];
				});

				dzPlayer.onLoadedTracks({
					data: latestEpisodes
				}, options);
			} else if (typeof loader[options.type] === 'object') {
				api.call({
					method: loader[options.type].api_method,
					data: loader[options.type].api_param,
					success: dzPlayer.onLoadedTracks,
					callback_parameters: options
				});
			}
		} catch (e) {
			error.log(e);
		}
	},

	onLoadedTracks: function(result, options) {
		try {
			options.data = result.data || [result];

			if (options.data.length === 0) {
				return false;
			}

			if (options.offset > 0 && options.data.length > 0) {
				options.data[0].OFFSET = options.offset;
			}

			dzPlayer.play(options);

		} catch (e) {
			error.log(e);
		}
	},

	playTrackAtIndex: function(index) {
		try {

			if (chromecast.isCasting()) {
				chromecast.executeAction('playAtIndex', [index]);
				return;
			}

			_trackList.setIndex(index);
			dzPlayer.setPlayerType('mod');
			dzPlayer._play(true);

		} catch (e) {
			error.log(e);
		}
	},

	setIndexSong: function(index) {
		try {
			_trackList.setIndex(index);
		} catch (e) {
			error.log(e);
		}
	},

	restoreTrackList: function() {
		_trackList.restore();
	},

	setTrackList: function(options, addQueue, addNext) {
		try {
			addQueue = addQueue || false;
			addNext = addNext || false;

			let futureIndex = (options.index === -1) ? 0 : options.index;
			let filteredTrack = [];

			for (let d = 0; d < options.data.length; d++) {

				if (typeof options.data[d] !== 'object') {
					continue;
				}

				let is_readable = false;

				if (chromecast.isCasting() && options.chromecast) {

					filteredTrack.push({
						data: options.data[d].data,
						context: options.data[d].context
					});

					is_readable = true;

				} else {

					const songAvailable = right.checkSongAvailable(options.data[d]);

					if (songAvailable === right.READABLE && dzPlayer.getMediaType(options.data[d]) === dzPlayer.MEDIA_TYPE_TALK) {
						options.data[d].OFFSET = parseInt(userData.getEpisodeBookmark(options.data[d].EPISODE_ID).OFFSET, 10);
						filteredTrack.push({data: options.data[d], context: options.context});
						continue;
					}

					if (songAvailable == right.READABLE || (dzPlayer.isRadio() && songAvailable != right.EXPLICIT_LYRICS)) {
						filteredTrack.push({data: options.data[d], context: options.context});
						is_readable = true;
					} else if (typeof options.data[d].FALLBACK === 'object' && right.checkSongAvailable(options.data[d].FALLBACK) == right.READABLE) {
						options.data[d].SNG_ID_ORIGIN = options.data[d].SNG_ID;
						filteredTrack.push({data: $.extend({}, options.data[d], options.data[d].FALLBACK), context: options.context});
						is_readable = true;
					}

				}

				if (d == futureIndex) {
					futureIndex = is_readable ? (filteredTrack.length - 1) : filteredTrack.length;
				}

			}

			if (typeof options.callbackTrack === 'function') {
				options.callbackTrack(filteredTrack);
			}

			if (filteredTrack.length === 0) {
				return false;
			}

			if (!chromecast.isCasting() && (addQueue || addNext)) {
				_trackList.set(filteredTrack, {
					addQueue: addQueue,
					addNext: addNext,
					caller: options.caller
				});

				if (typeof options.context !== 'undefined' && options.context.TYPE.indexOf('adsTracking') > -1) {
					Events.trigger(Events.ads.addToQueueList, 'interaction_queuelist');
				}

				Events.trigger(
					Events.player.displayCurrentSong,
					dzPlayer.getCurrentSong()
				);

				Events.trigger(Events.player.play, {
					value: dzPlayer.getCurrentSong()
				});

				return true;
			}

			_trackList.set(filteredTrack);
			_trackList.setIndex(futureIndex);

			options.index = futureIndex;

			if (options.offset > 0) {
				options.data[options.index].OFFSET = options.offset;
			}

			if (dzPlayer.isShuffle() && dzPlayer.getPlayerType() === 'mod' && !chromecast.isCasting()) {
				let index_first_track = options.index;
				if (index_first_track === -1) {
					// On random la premiere track
					index_first_track = Math.round(Math.random() * (_dzPlayer.trackList.length - 1));
					_trackList.setIndex(index_first_track);
				}
				_trackList.shuffle(index_first_track);
			}

			if (dzPlayer.isMuted()) {
				dzPlayer.control.mute(false);
			}

			if (chromecast.isCasting()) {

				if (options.playOnChromecast) {
					chromecast.executeAction('playTracks');
					return;
				}

				Events.trigger(
					Events.player.displayCurrentSong,
					dzPlayer.getCurrentSong()
				);

				Events.trigger(Events.player.play, {
					value: dzPlayer.getCurrentSong()
				});

				return;
			}

			if (typeof options.context !== 'undefined' && options.context.TYPE.indexOf('adsTracking') > -1) {
				Events.trigger(Events.ads.playMusic, 'interaction_play');
			}
			dzPlayer._play(options.autoplay);

			return true;

		} catch (e) {
			error.log(e);
		}

	},

	getTrackList: function(keep_context, unshuffled) {
		if (keep_context === true) {

			var list = unshuffled === true && dzPlayer.isShuffle() ? (
				_dzPlayer.trackListOriginal
			) : _dzPlayer.trackList;

			return list;

		}

		var data = [];

		var limit = _dzPlayer.recommendationsIndex || _dzPlayer.trackList.length;
		for (var t = 0; t < limit; t++) {
			if (unshuffled === true && dzPlayer.isShuffle() && _dzPlayer.trackListOriginal[t]) {
				data.push(_dzPlayer.trackListOriginal[t].data);
			} else if (_dzPlayer.trackList[t]) {
				data.push(_dzPlayer.trackList[t].data);
			}
		}

		return data;
	},

	getTrackListType: function() {
		return _dzPlayer.trackListType;
	},

	setTrackListType: function(type) {
		_dzPlayer.trackListType = type;
	},

	getTrackListIndex: function() {
		return _dzPlayer.trackListIndex;
	},

	getTrackListDuration: function() {
		return _dzPlayer.trackListDuration || 0;
	},

	// Fetch recommendations for the current artist/track
	fetchRecommendations: function(next) {
		// Only for logged-in users and music tracks
		if (!config.get('USER.USER_ID') ||
			!config.get('USER.SETTING.global.has_up_next') ||
			!config.get('USER.HAS_UPNEXT') ||
			Number(dzPlayer.appId) !== 0 ||
			dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM ||
			dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_TALK) {
			return next();
		}

		// Store index at which recommendations start, and last valid track song/artist on which recommendations
		// will be calculated
		if (!_dzPlayer.recommendationsIndex) {
			var lastValidTrack;

			for (var i = _dzPlayer.trackList.length - 1; i >= 0; i--) {
				if (_dzPlayer.trackList[i].data.SNG_ID > 0) {
					lastValidTrack = _dzPlayer.trackList[i].data;
					break;
				}
			}

			if (lastValidTrack) {
				_dzPlayer.recommendationsIndex = _dzPlayer.trackList.length;
				_dzPlayer.recommendationsSngId = lastValidTrack.SNG_ID;
				_dzPlayer.recommendationsArtId = lastValidTrack.ART_ID;
			}
		}

		// No valid track found
		if (!_dzPlayer.recommendationsIndex) {
			return next();
		}

		api.call({
			method: 'radio.getUpNext',
			data: {
				sng_id: _dzPlayer.recommendationsSngId,
				art_id: _dzPlayer.recommendationsArtId,
				limit: 10
			},
			success: function(res) {
				next(res.data);
			},
			error: function() {
				next();
			}
		});
	},

	// Return the list of recommended tracks
	getRecommendations: function() {
		if (_dzPlayer.recommendationsIndex) {
			var list = _dzPlayer.trackList;
			return list.slice(_dzPlayer.recommendationsIndex).map(function(track) {
				return track.data;
			});
		}

		return [];
	},

	// Clear the list of recommended tracks & related data
	clearRecommendations: function() {
		if (!_dzPlayer.recommendationsIndex) {
			return;
		}

		_trackList.remove(_dzPlayer.recommendationsIndex, _dzPlayer.trackList.length)
		delete _dzPlayer.recommendationsIndex;
		delete _dzPlayer.recommendationsArtId;
		delete _dzPlayer.recommendationsSngId;
	},

	getSponsoredData: function(track = dzPlayer.getCurrentSong()) {
		return dzPlayer.helper.isSponsoredTrack(track) ? track.__PAYLOAD__.SPONSORED : null;
	},

	getLivestreamData: function(data) {
		const stream = {
			id: Number(data.LIVESTREAM_ID),
			title: data.LIVESTREAM_TITLE,
			picture: data.LIVESTREAM_IMAGE_MD5,
			isFingerprinted: Number(data.LIVESTREAM_IS_FINGERPRINTED) || 0,
			codec: null,
			url: null
		};
		const bitrates = Object.keys(data.LIVESTREAM_URLS.data).sort(function(a, b) {
			return Number(b) - Number(a);
		});

		for (let i = 0, l = bitrates.length; i < l; i++) {
			const bitrate = bitrates[i];

			for (let codec in data.LIVESTREAM_URLS.data[bitrate]) {
				if (dzPlayer.SUPPORTED_CODECS.indexOf(codec) !== -1) {
					stream.codec = codec;
					stream.url = data.LIVESTREAM_URLS.data[bitrate][codec];
					break;
				}
			}

			if (stream.codec !== null && stream.url !== null) {
				break;
			}
		}

		if (Number(data.LIVESTREAM_IS_FINGERPRINTED) === 1) {
			dzPlayer.liveStreamChannel = '-1_0_LIVESTREAM_' + data.LIVESTREAM_ID;
			live.addChannel(dzPlayer.liveStreamChannel);
			Events.subscribe(Events.live.livestream, dzPlayer.onGetLiveStreamTrack);
		}

		return [{
			MD5_ORIGIN: stream.url,
			LIVE_STREAM: true,
			EXTERNAL: true,
			FORMAT: stream.codec,
			TYPE: 1,
			SNG_TITLE: stream.title,
			PICTURE_URL: stream.picture,
			LIVE_ID: stream.id,
			IS_FINGERPRINTED: stream.isFingerprinted
		}];
	},

	fingerprintSubscribe: function() {
		var livestream = dzPlayer.getCurrentSong();

		if (livestream.IS_FINGERPRINTED === 0) {
			return;
		}

		dzPlayer.liveStreamChannel = '-1_0_LIVESTREAM_' + livestream.LIVE_ID;
		live.addChannel(dzPlayer.liveStreamChannel);
		Events.subscribe(Events.live.livestream, dzPlayer.onGetLiveStreamTrack);

		api.call({
			method: 'livestream.getMedia',
			data: {
				LIVESTREAM_ID: livestream.LIVE_ID
			},
			success: function(result) {
				if (result === false) {
					return;
				}

				Events.trigger(Events.player.displayRecognizedTrack, result);
			}
		});
	},

	onGetLiveStreamTrack: function(e, data) {
		if (data[0].VALUE.MEDIA === null) {
			Events.trigger(Events.player.displayRecognizedTrack, null);
			return;
		}

		api.call({
			method: 'song.getData',
			data: {
				SNG_ID: data[0].VALUE.MEDIA.ID
			},
			success: function(result) {
				Events.trigger(Events.player.displayRecognizedTrack, result);
			}
		});
	},

	enqueueTracks: function(songs, context) {
		try {
			dzPlayer.setTrackList({
				data: songs,
				context
			}, true, false);
		} catch (e) {
			error.log(e);
		}
	},

	addNextTracks: function(songs, context) {
		try {
			dzPlayer.setTrackList({
				data: songs,
				context
			}, false, true);
		} catch (e) {
			error.log(e);
		}

	},

	setAudioAds: function(data) {
		try {
			dzPlayer.audioAds = data;
		} catch (e) {
			error.log(e);
		}
	},

	getAudioAds: function() {
		try {
			if (typeof ads !== 'undefined' && ads.allow_audio === false) {
				return null;
			}
			return dzPlayer.audioAds;
		} catch (e) {
			error.log(e);
		}
	},

	isStoreTrack: function(isrc) {
		try {
			if (typeof userData === 'object' && typeof userData.dataStore === 'object') {
				return (typeof userData.dataStore[isrc] === 'boolean' && isrc != '');
			}
			return false;
		} catch (e) {
			error.log(e);
		}
	},

	isRadio: function() {
		return (dzPlayer.getPlayerType() === 'radio');
	},

	getIndexSong: function() {
		return _dzPlayer.trackListIndex;
	},

	getNbSongs: function() {
		return _dzPlayer.trackList.length;
	},

	getNbSongsTotal: function() {
		return _dzPlayer.nbSongsTotal;
	},

	setNbSongsTotal: function(total) {
		_dzPlayer.nbSongsTotal = total;
	},

	isLastSong: function() {
		if (dzPlayer.getRepeat() > 0) {
			return false;
		}

		if (_dzPlayer.trackListIndex >= dzPlayer.getNbSongs() - 1) {
			return chromecast.isCasting() ? chromecast.getChunksInfo().next === null : true;
		}

		return false;
	},

	getTotalDuration: function() {
		let totalDuration = 0;
		for (let j = 0; j < _dzPlayer.trackList.length; j++) {
			if (!isNaN(_dzPlayer.trackList[j].data.DURATION)) {
				totalDuration += parseInt(_dzPlayer.trackList[j].data.DURATION, 10);
			}
		}

		return totalDuration;
	},

	getNextSong: function() {
		let nextSong = null;

		if (dzPlayer.repeat == 0 || dzPlayer.isRadio()) {
			nextSong = (_dzPlayer.trackListIndex + 1 < dzPlayer.getNbSongs()) ? _dzPlayer.trackList[_dzPlayer.trackListIndex + 1].data : null;
		} else if (dzPlayer.repeat == 1) {
			const index = (_dzPlayer.trackListIndex == _dzPlayer.trackList.length - 1) ? 0 : _dzPlayer.trackListIndex + 1;
			nextSong = _dzPlayer.trackList[index].data;
		} else if (dzPlayer.repeat == 2) {
			nextSong = dzPlayer.getCurrentSong();
		}

		if (nextSong === null && chromecast.isCasting() && chromecast.getChunksInfo().next !== null) {
			nextSong = {};
		}

		return nextSong;

	},

	getPrevSong: function() {
		let prevSong = null;

		if (dzPlayer.getRepeat() == 0 || dzPlayer.isRadio()) {
			prevSong = _dzPlayer.trackListIndex != 0 ? _dzPlayer.trackList[_dzPlayer.trackListIndex - 1].data : null;
		} else if (dzPlayer.getRepeat() == 1) {
			const index = (_dzPlayer.trackListIndex == 0) ? _dzPlayer.trackList.length - 1 : _dzPlayer.trackListIndex - 1;
			prevSong = _dzPlayer.trackList[index].data;
		} else if (dzPlayer.getRepeat() == 2) {
			prevSong = dzPlayer.getCurrentSong();
		}

		if (prevSong === null && chromecast.isCasting() && chromecast.getChunksInfo().prev !== null) {
			prevSong = {};
		}

		return prevSong;

	},

	getCurrentSong: function(prop = '') {
		try {
			prop = prop === 'MEDIA_ID' ? dzPlayer.getMediaId() : prop;

			const defaultOpts = {
				SNG_ID: 0,
				ART_ID: 0,
				ALB_ID: 0,
				ALB_PICTURE: '',
				URL: '',
				DURATION: 0
			};

			const trackList = _dzPlayer.trackList[_dzPlayer.trackListIndex];
			const playerType = dzPlayer.getPlayerType();

			if (typeof trackList !== 'undefined' && typeof trackList.data !== 'undefined' && playerType !== 'ads' && playerType !== 'jingle') {
				return (prop === '') ? new Track(trackList.data) : trackList.data[prop] || defaultOpts[prop];
			}

			return (prop === '') ? null : defaultOpts[prop];

		} catch (e) {
			error.log(e);
		}

	},

	isAdvertisingAllowed: function() {
		if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_TALK && !Number(dzPlayer.getCurrentSong('SHOW_IS_ADVERTISING_ALLOWED'))) {
			return false;
		}

		return true;
	},

	getMediaType: function(data = dzPlayer.getCurrentSong()) {
		if (data === null) {
			return false;
		}

		if (typeof data.EPISODE_ID !== 'undefined') {
			return dzPlayer.MEDIA_TYPE_TALK;
		}

		if (data.LIVE_STREAM) {
			return dzPlayer.MEDIA_TYPE_LIVE_STREAM;
		}

		if (data.EXTERNAL) {
			return dzPlayer.MEDIA_TYPE_EXTERNAL;
		}

		return dzPlayer.MEDIA_TYPE_SONG;
	},

	getMediaId: function(data = dzPlayer.getCurrentSong()) {
		if (data === null) {
			return false;
		}

		const mediaType = dzPlayer.getMediaType(data);
		switch (mediaType) {
			case dzPlayer.MEDIA_TYPE_TALK:
				return 'EPISODE_ID';
			case dzPlayer.MEDIA_TYPE_LIVE_STREAM:
				return 'LIVE_ID';
			case dzPlayer.MEDIA_TYPE_EXTERNAL:
				return 'EXTERNAL_ID';
			default:
				return 'SNG_ID';
		}
	},

	getContext: function(prop) {
		try {
			if (typeof _dzPlayer.trackList[_dzPlayer.trackListIndex] != 'undefined' && typeof _dzPlayer.trackList[_dzPlayer.trackListIndex].context != 'undefined' && dzPlayer.getPlayerType() !== 'ads' && dzPlayer.getPlayerType() !== 'jingle') {
				return (typeof prop !== 'string') ? _dzPlayer.trackList[_dzPlayer.trackListIndex].context : _dzPlayer.trackList[_dzPlayer.trackListIndex].context[prop];
			}

			const defaultOpts = {ID: '', TYPE: '', CONTEXT_ID: ''};

			return (typeof prop !== 'string') ? null : defaultOpts[prop];
		} catch (e) {
			error.log(e);
		}
	},

	getRepeat: function() {
		if (dzPlayer.isRadio() || dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_TALK || dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM) {
			return 0;
		}

		if (typeof dzPlayer.repeat === 'string' && dzPlayer.repeat.length > 1) {
			dzPlayer.repeat = 0;
		}

		return parseInt(dzPlayer.repeat, 10);
	},

	getPosition: function() {
		return dzPlayer.position;
	},

	getExactPosition: function() {
		return dzPlayer.trigger('audioPlayer_getPosition', []);
	},

	getDuration: function() {
		return dzPlayer.duration;
	},

	getVolume: function() {
		return dzPlayer.volume;
	},

	isShuffle: function() {
		if (dzPlayer.isRadio() || dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_TALK) {
			return false;
		}

		return dzPlayer.shuffle;
	},

	removeTracks: function(index, length) {
		if (parseInt(index, 10) != index || index < 0) {
			const err = new Error('removeTracks: index param must be a positive integer');
			err.name = 'DZPLAYER';
			throw err;
		}

		if (length === undefined) {
			length = 1;
		} else if (parseInt(length, 10) != length || length <= 0) {
			const err = new Error('removeTracks: length param must be a strictly positive integer');
			err.name = 'DZPLAYER';
			throw err;
		}

		// If we want to remove the current track from the track list
		if (dzPlayer.getIndexSong() == index) {

			// If track list has only one track left, then do nothing
			if (_dzPlayer.trackList.length === 1) {
				return false;
			}

			// If we want to remove all the remaining tracks, the play the previous track
			// otherwise, play the tracks after the removed track list
			dzPlayer.playTrackAtIndex(Number(index) + (_dzPlayer.trackList.length - 1 == index + length ? -1 : 1));
		}

		return _trackList.remove(index, length);
	},

	replaceTracks: function(index, songs, context) {
		dzPlayer.removeTracks(index, dzPlayer.getNbSongs() - index);
		dzPlayer.enqueueTracks(songs, context);
	},

	orderTracks: function(order) {
		return _trackList.order(order);
	},

	isMuted: function() {
		return dzPlayer.muted;
	},

	isPlaying: function() {
		return dzPlayer.playing;
	},

	isPaused: function() {
		return dzPlayer.paused;
	},

	getArtistName: function() {
		return dzPlayer.getCurrentSong('ART_NAME');
	},

	getAlbumTitle: function() {
		return dzPlayer.getCurrentSong('ALB_TITLE');
	},

	getSongTitle: function() {
		return dzPlayer.getCurrentSong('SNG_TITLE');
	},

	getPlayerType: function() {
		return dzPlayer.playerType;
	},

	getPlayerTypeId: function() {
		if (dzPlayer.playerType == 'radio') {
			return 1;
		}

		return 0;
	},

	setPlayerType: function(type) {
		if (dzPlayer.getPlayerType() != type) {
			dzPlayer.playerType = type;
			dzPlayer.trigger('audioPlayer_setType', [type]);
		}

		// Clear recommendations when switching to non-radio play
		if (type !== 'radio' && type !== 'ads') {
			dzPlayer.clearRecommendations();
		}

		_dzPlayerEvents.trigger(Events.player.changePlayerType, dzPlayer.playerType);
	},

	getSongId: function() {
		return dzPlayer.getCurrentSong('MEDIA_ID');
	},

	isLoading: function() {
		return dzPlayer.loading;
	},

	getCover: function() {
		return dzPlayer.getCurrentSong('ALB_PICTURE');
	},

	isFadeInProgress: function() {
		return dzPlayer.fadeInProgress;
	},

	isFadeOutProgress: function() {
		return dzPlayer.fadeOutProgress;
	},

	isHq: function() {
		return dzPlayer.hq;
	},

	setOffline: function(status) {
		dzPlayer.trigger('audioPlayer_setOffline', [status]);
	},

	sendFile: function(file) {
		dzPlayer.trigger('audioPlayer_sendFile', [file]);
	},

	isLimited: function() {
		if (getSize(dzPlayer.user_status) > 0) {
			return dzPlayer.user_status.limited;
		}

		return false;
	},

	getRadioType: function() {
		return dzPlayer.radioType;
	},

	skipRadioAllowed: function() {
		if (dzPlayer.user_status.radio_skips === 0) {
			return true;
		}

		if (dzPlayer.helper.isPlayingFlow() && USER.OPTIONS.web_hq) {
			return true;
		}

		return (dzPlayer.radioSkipCounter < dzPlayer.user_status.radio_skips);
	},

	radioStartListen: function(id, type) {
		dzPlayer.radioType = type;
		_dzPlayerEvents.trigger(Events.radio.start, {type: type, id: id});
	},

	radioSkipSetTimer: function() {
		clearTimeout(dzPlayer.radioSkipIntervalId);
		dzPlayer.radioSkipIntervalId = 0;
		dzPlayer.radioSkipCounter = 0;

		if (dzPlayer.isRadio()) {
			dzPlayer.radioSkipIntervalId = setTimeout(dzPlayer.radioSkipSetTimer, dzPlayer.radioSkipInterval);
		}
	},

	helper: {

		isPlayingFlow: function() {
			const context = dzPlayer.getContext();
			const chromecastFlow = getDeepKey(chromecast.getMedia(), 'customData.playingFlow');
			return chromecastFlow || (context !== null && /user_radio/.test(context.TYPE));
		},

		isPlayingUserFlow: function() {
			const context = dzPlayer.getContext();
			const chromecastFlow = getDeepKey(chromecast.getMedia(), 'customData.playingFlow');
			return chromecastFlow || (context !== null && /user_radio/.test(context.TYPE) && USER.USER_ID === dzPlayer.getContext().ID);
		},

		isSponsoredTrack: function(track = dzPlayer.getCurrentSong()) {
			if (!track || !track.__PAYLOAD__) {
				return false;
			}

			return Boolean(track.__PAYLOAD__.SPONSORED);
		}

	},

	control: {

		// Testing available actions
		canSeek: function() {
			if (chromecast.isLoading()) {
				return false;
			}

			if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM) {
				return false;
			}

			if (dzPlayer.isRadio() && USER.OPTIONS.web_hq) {
				return true;
			}

			if (dzPlayer.getPlayerType() === 'mod' || dzPlayer.getPlayerType() === 'planning') {
				return true;
			}

			return false;
		},

		play: function() {
			try {
				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.isPlaying() === false && dzPlayer.isPaused() === false) {
					if (dzPlayer.getCurrentSong('MEDIA_ID') !== 0) {
						dzPlayer._play(true);
						if (dzPlayer.getNbSongs() < dzPlayer.getNbSongsTotal()) {
							dzPlayer.loadTracks({
								id: dzPlayer.getContext('ID'),
								type: dzPlayer.getTrackListType(),
								start: dzPlayer.getNbSongs(),
								radio: dzPlayer.isRadio(),
								context: dzPlayer.getContext(),
								addQueue: true,
								caller: 'player'
							});
						}
					}
				} else {
					_dzPlayerEvents.trigger(Events.player.resume, {value: dzPlayer.getCurrentSong()});
					dzPlayer.trigger('audioPlayer_play');
				}

			} catch (e) {
				error.log(e);
			}
		},

		pause: function() {
			try {
				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.getPlayerType() === 'ads') {
					return false;
				}

				dzPlayer.trigger('audioPlayer_pause');

				if (getSize(dzPlayer.logTrack) > 0 && typeof dzPlayer.logTrack.stat !== 'undefined') {
					dzPlayer.logTrack.stat.pause++;
				}

			} catch (e) {
				error.log(e);
			}
		},

		stop: function() {
			if (chromecast.isLoading()) {
				return false;
			}

			if (dzPlayer.getPlayerType() === 'ads') {
				return false;
			}

			if (dzPlayer.getMediaType() !== dzPlayer.MEDIA_TYPE_LIVE_STREAM) {
				return false;
			}

			if (dzPlayer.liveStreamChannel) {
				Events.trigger(Events.player.displayRecognizedTrack, null);
			}

			dzPlayer.trigger('audioPlayer_stop');
			dzPlayer.logManager(false);
		},

		nextSong: function(naturalEnd) {
			try {

				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.getPlayerType() === 'ads') {
					return false;
				}

				if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM) {
					return false;
				}

				if (typeof naturalEnd === 'undefined') {
					naturalEnd = false;
				}

				if (dzPlayer.isRadio() && !dzPlayer.skipRadioAllowed() && !naturalEnd) {
					return false;
				}

				if (!naturalEnd) {

					if (!chromecast.isCasting()) {

						if (getSize(dzPlayer.logTrack) === 0) {
							dzPlayer.logManager(false);
						}

						if (getSize(dzPlayer.logTrack) > 0 && typeof dzPlayer.logTrack.stat !== 'undefined') {
							dzPlayer.logTrack.stat.next = true;
						}

					}

					if (dzPlayer.isRadio() && !dzPlayer.helper.isSponsoredTrack()) {
						dzPlayer.radioSkipCounter++;
					}

				}

				var autoPlay = true;
				if (naturalEnd && dzPlayer.playerType == 'mod') {
					autoPlay = !dzPlayer.isLimited();
				}

				dzPlayer.previousSkipAction = 'next';

				if (chromecast.isCasting()) {
					chromecast.executeAction('nextSong');
					return;
				}

				if (!naturalEnd) {
					Events.trigger(Events.player.trackSkipped, dzPlayer.getCurrentSong());
				}

				if (dzPlayer.getRepeat() === 0 && _dzPlayer.trackListIndex < _dzPlayer.trackList.length - 1) {
					_dzPlayer.trackListIndex++;
				} else if (dzPlayer.getRepeat() === 1 && _dzPlayer.trackListIndex < _dzPlayer.trackList.length - 1) {
					_dzPlayer.trackListIndex++;
				} else if (dzPlayer.getRepeat() === 1 && _dzPlayer.trackListIndex == _dzPlayer.trackList.length - 1) {
					_dzPlayer.trackListIndex = 0;
				} else if (dzPlayer.getRepeat() !== 2) {
					dzPlayer.fetchRecommendations(function(data) {
						// If nothing returned, the tracklist has ended
						if (!data || !data.length) {
							dzPlayer.playing = false;
							dzPlayer.logManager(false);

							dzPlayer.setPlayerType('mod');
							_dzPlayer.trackListIndex = 0;
							dzPlayer._play(false, true);
							_dzPlayerEvents.trigger(Events.player.finishTrackList);
						} else {
							dzPlayer.setTrackList({
								data: data,
								context: {
									TYPE: 'up_next_artist',
									ID: Number(_dzPlayer.recommendationsSngId)
								}
							}, true, false);

							// Advance to the next recommended track
							_dzPlayer.trackListIndex++;
							dzPlayer.setPlayerType('radio');
							dzPlayer._play(autoPlay, naturalEnd);
						}
					});

					return false;
				}

				dzPlayer._play(autoPlay, naturalEnd);

			} catch (e) {
				error.log(e);
			}
		},

		prevSong: function() {
			try {

				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.getPlayerType() === 'ads') {
					return false;
				}

				if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM) {
					return false;
				}

				// Up Next allows back, unlike other radios
				if (dzPlayer.isRadio() && dzPlayer.getContext().TYPE !== 'up_next_artist') {
					return false;
				}

				if (!chromecast.isCasting() && getSize(dzPlayer.logTrack) > 0 && typeof dzPlayer.logTrack.stat !== 'undefined') {
					dzPlayer.logTrack.stat.prev = true;
				}

				dzPlayer.previousSkipAction = 'prev';

				if (chromecast.isCasting()) {
					chromecast.executeAction('prevSong');
					return;
				}

				Events.trigger(Events.player.trackSkipped, dzPlayer.getCurrentSong());

				if (dzPlayer.getRepeat() == 0 && _dzPlayer.trackListIndex > 0) {
					_dzPlayer.trackListIndex--;
				} else if (dzPlayer.getRepeat() == 1 && _dzPlayer.trackListIndex > 0) {
					_dzPlayer.trackListIndex--;
				} else if (dzPlayer.getRepeat() == 1 && _dzPlayer.trackListIndex == 0) {
					_dzPlayer.trackListIndex = _dzPlayer.trackList.length - 1;
				} else if (dzPlayer.getRepeat() == 2) {
					_dzPlayer.trackListIndex = _dzPlayer.trackListIndex;
				} else {
					return false;
				}

				// Ensure that back sets the mode to mod, if we were previously in an Up Next recommendation radio
				if (dzPlayer.getContext().TYPE !== 'up_next_artist') {
					dzPlayer.setPlayerType('mod');
				}

				dzPlayer._play(true);

			} catch (e) {
				error.log(e);
			}
		},

		togglePause: function() {
			try {
				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.isPlaying()) {
					dzPlayer.control.pause();
				} else {
					dzPlayer.control.play();
				}

			} catch (e) {
				error.log(e);
			}
		},

		setRepeat: function(repeat) {
			try {
				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_TALK || dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM) {
					return false;
				}

				dzPlayer.repeat = repeat;

				Events.trigger(Events.player.repeat_changed, dzPlayer.repeat);

				userSetting.set({site: {player_repeat: dzPlayer.repeat}});

				if (chromecast.isCasting()) {
					chromecast.executeAction('repeatChanged', [dzPlayer.repeat]);
				}

			} catch (e) {
				error.log(e);
			}
		},

		setVolume: function(volume, save) {
			try {
				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.getPlayerType() == 'ads') {
					return false;
				}

				if (dzPlayer.isMuted() && volume > 0) {
					dzPlayer.control.mute(false);
				}

				save = save || false;

				dzPlayer.volume = volume;
				dzPlayer.trigger('audioPlayer_setVolume', [volume]);

				Events.trigger(Events.player.volume_changed, Math.round(volume * 100));

				if (save) {
					storage.set('volume', dzPlayer.volume);
				}

			} catch (e) {
				error.log(e);
			}
		},

		setShuffle: function(status) {
			try {
				if (chromecast.isActive()) {
					return false;
				}

				if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_TALK) {
					return false;
				}

				if (_dzPlayer.trackList.length === 0) {
					return false;
				}

				dzPlayer.shuffle = status;
				let save = true;

				if (!chromecast.isCasting()) {

					if (dzPlayer.shuffle) {
						_trackList.shuffle();
					} else {
						_trackList.unShuffle();
					}
				}

				if (save) {
					userSetting.set({site: {player_shuffle: dzPlayer.shuffle}});
				}

				_dzPlayerEvents.trigger(Events.player.shuffle_changed, dzPlayer.shuffle);

			} catch (e) {
				error.log(e);
			}
		},

		mute: function(bMute) {
			try {
				if (chromecast.isLoading()) {
					return false;
				}

				if (dzPlayer.getPlayerType() == 'ads') {
					return false;
				}

				dzPlayer.muted = !dzPlayer.muted;
				dzPlayer.trigger('audioPlayer_mute', [bMute]);
				Events.trigger(Events.player.mute_changed, dzPlayer.muted);

			} catch (e) {
				error.log(e);
			}
		},

		setSmartNotLike: function() {
			try {
				if (!chromecast.isCasting()) {
					api.call({
						method: 'smart_notLikeSong',

						data: {
							sng_id: dzPlayer.getCurrentSong('MEDIA_ID')
						}
					});
				}

				dzPlayer.control.nextSong();

			} catch (e) {
				error.log(e);
			}
		},

		seek: function(position) {
			try {
				if (!dzPlayer.control.canSeek()) {
					return false;
				}

				dzPlayer.trigger('audioPlayer_seek', [position]);

				if (!chromecast.isCasting() && getSize(dzPlayer.logTrack) > 0 && typeof dzPlayer.logTrack.stat !== 'undefined') {
					dzPlayer.logTrack.stat.seek++;
				}

				Events.trigger(Events.player.seek, position);

			} catch (e) {
				error.log(e);
			}
		},

		changeFadeValue: function(fade) {
			try {
				dzPlayer.trigger('audioPlayer_changeFadeValue', [fade]);
				dzPlayer.fade = fade;

				userSetting.set({site: {player_fade: dzPlayer.fade}});
				Events.trigger(Events.player.fade, dzPlayer.fade);

				return true;

			} catch (e) {
				error.log(e);
			}
		},

		setHq: function(status) {
			try {
				dzPlayer.hq = status;

				dzPlayer.trigger('audioPlayer_setHq', [status]);

				userSetting.set({site: {player_hq: dzPlayer.hq}});
				Events.trigger(Events.player.hq, dzPlayer.hq);
			} catch (e) {
				error.log(e);
			}
		},

		loadLyrics: function() {
			if (!dzPlayer.hasLyrics()) {
				return;
			}

			if (dzPlayer.hasLoadedLyrics()) {
				Events.trigger(Events.lyrics.load);
			} else {
				const sngID = dzPlayer.getCurrentSong('MEDIA_ID');
				const lyricsID = dzPlayer.getCurrentSong('LYRICS_ID');
				api.call({
					method: 'song.getLyrics',
					data: {
						SNG_ID: sngID
					},
					success: function(data) {
						// Split text lyrics by carriage return
						if (data.LYRICS_TEXT) {
							data.LYRICS_TEXT = data.LYRICS_TEXT.split(/\r\n|\r|\n/g);
						}

						_dzPlayer.lyrics['LYRICS_' + lyricsID] = data;
						Events.trigger(Events.lyrics.load);
					}
				});
			}

		}
	},

	// Returns sync lyrics if present, text lyrics otherwise
	getLyrics: function() {
		if (dzPlayer.hasLoadedLyrics()) {
			const key = 'LYRICS_' + dzPlayer.getCurrentSong('LYRICS_ID');
			if (dzPlayer.hasSyncLyrics()) {
				return _dzPlayer.lyrics[key].LYRICS_SYNC_JSON;
			}

			const textLyrics = _dzPlayer.lyrics[key].LYRICS_TEXT;
			if (textLyrics && textLyrics.length) {
				return textLyrics;
			}
		}

		return null;
	},

	getLyricsMetadata: function() {
		if (dzPlayer.hasLoadedLyrics()) {
			const key = 'LYRICS_' + dzPlayer.getCurrentSong('LYRICS_ID');

			return {
				copyrights: _dzPlayer.lyrics[key].LYRICS_COPYRIGHTS,
				writers: _dzPlayer.lyrics[key].LYRICS_WRITERS
			};
		}

		return null;
	},

	// Returns true if the track has a valid LYRICS_ID
	hasLyrics: function() {
		const lyricsID = dzPlayer.getCurrentSong('LYRICS_ID');
		return typeof lyricsID !== 'undefined' && lyricsID !== 0;
	},

	// Returns true if either text or sync lyrics have been loaded for the current track
	hasLoadedLyrics: function() {
		if (!dzPlayer.hasLyrics()) {
			return false;
		}

		const key = 'LYRICS_' + dzPlayer.getCurrentSong('LYRICS_ID');
		return (typeof _dzPlayer.lyrics[key] !== 'undefined');
	},

	// Returns true if sync lyrics are available for the current song
	hasSyncLyrics: function() {
		if (!dzPlayer.hasLoadedLyrics()) {
			return false;
		}

		const key = 'LYRICS_' + dzPlayer.getCurrentSong('LYRICS_ID');
		const syncLyrics = _dzPlayer.lyrics[key].LYRICS_SYNC_JSON;
		return (typeof syncLyrics !== 'undefined' && syncLyrics.length !== 0);
	},

	logManager: function(sendNextSong) {
		try {

			if (chromecast.isActive()) {
				return;
			}

			// sendNextSong = true for last track in the trackList or final call before unload
			if (typeof sendNextSong == 'undefined') {
				sendNextSong = true;
			}

			if (getSize(dzPlayer.logTrack) > 0) {

				if (OFFLINE) {

					dzPlayer.logTrack.force_timestamp = SERVER_TIMESTAMP;
					Events.trigger(Events.player.log_offline, dzPlayer.logTrack);

				} else {

					let logNextSong = {};

					if (sendNextSong && getSize(dzPlayer.logStartedTrack()) > 0) {
						logNextSong = dzPlayer.logStartedTrack();
					}

					if (typeof dzPlayer.user_status.timestamp != 'undefined') {
						dzPlayer.logTrack.timestamp = dzPlayer.user_status.timestamp;
					}

					if (dzPlayer.logTrack.sng_id > 0 && dzPlayer.getPlayerType() == 'mod') {
						Events.trigger(Events.player.updateRestrictTime, dzPlayer.logTrack.lt);
					}

					dzPlayer.sendLog(dzPlayer.logTrack, logNextSong);

					if (!sendNextSong) {
						dzPlayer.logTrack = {};
						return false;
					}
				}

			} else if (getSize(dzPlayer.logStartedTrack()) && sendNextSong) {
				dzPlayer.sendLog(dzPlayer.logTrack, dzPlayer.logStartedTrack());
			}

			// INIT NEXT LOG
			dzPlayer.logTrack = $.extend(true, {}, dzPlayer.logTrackTemplate);

			if (dzPlayer.isLimited()) {
				dzPlayer.logTrack.l_30sec = 1;
			}

			// SET SNG_ID
			dzPlayer.logTrack.media.id = dzPlayer.getCurrentSong('MEDIA_ID');
			dzPlayer.logTrack.media.type = dzPlayer.getLogType();

			// SET PAYLOAD
			const payload = dzPlayer.getCurrentSong('__PAYLOAD__');
			if (getSize(payload) > 0) {
				dzPlayer.logTrack.payload = payload;
			}

			// SET APP ID
			if (dzPlayer.getContext('TYPE') === 'inapp') {
				dzPlayer.logTrack.app = {
					id: dzPlayer.getContext('ID'),
					t: dzPlayer.getContext('TYPE')
				};
			} else if (Number(dzPlayer.appId) !== 0) {
				dzPlayer.logTrack.app = {
					id: dzPlayer.appId,
					t: dzPlayer.appType
				};
			}

			// SET CONTEXT
			if (dzPlayer.getContext('TYPE') != '') {
				dzPlayer.logTrack.ctxt.t = dzPlayer.getContext('TYPE');
			}

			if (dzPlayer.getContext('ID') != '') {
				dzPlayer.logTrack.ctxt.id = dzPlayer.getContext('ID');
			}

			if (dzPlayer.getContext('CONTEXT_ID') != '') {
				dzPlayer.logTrack.ctxt.c = dzPlayer.getContext('CONTEXT_ID');
			}

			dzPlayer.logTrack.ts_listen = config.get('SERVER_TIMESTAMP');

			if (dzPlayer.getLogType() === 'live') {
				dzPlayer.logTrack.session_id = dzPlayer.LOG_UID;
			}

			// SPONSORED TRACK
			if (dzPlayer.helper.isSponsoredTrack()) {
				dzPlayer.logTrack.sponsored = true;
			}

			// FOUND TYPE
			dzPlayer.logTrack.type = dzPlayer.getPlayerTypeId();

		} catch (e) {
			error.log(e);
		}
	},

	logStartedTrack: function() {
		try {
			let liveTrack = {};
			if (dzPlayer.getCurrentSong() !== null && config.get('USER.USER_ID') > 0) {
				liveTrack = {
					id: dzPlayer.getCurrentSong('MEDIA_ID'),
					type: dzPlayer.getLogType()
				};
			}

			return liveTrack;

		} catch (e) {
			error.log(e);
		}
	},

	getLogType: function() {
		let type = dzPlayer.getMediaType();

		if (type === dzPlayer.MEDIA_TYPE_LIVE_STREAM && dzPlayer.getCurrentSong('MEDIA_ID') > 0) {
			type = 'live';
		}

		return type;
	},

	sendLog: function(logSong, logNextSong) {
		try {

			if (chromecast.isActive()) {
				return;
			}

			Events.trigger(Events.player.setBookmark, $.extend(false, logSong, {offset: dzPlayer.getPosition(), duration: dzPlayer.getDuration()}));

			let songsParams = {};
			if (getSize(logSong) > 0) {
				songsParams.params = logSong;

				if (typeof logSong.lt === 'undefined') {
					logger.error('Missing listening_time', logSong);
				}

			}

			if (getSize(logNextSong) > 0) {
				songsParams.next_media = {media: logNextSong};
			}

			api.call({
				method: 'log.listen',
				data: songsParams,
				success: function(result) {
					dzPlayer.token = result;
					if (dzPlayer.token !== false) {
						dzPlayer.trigger('audioPlayer_setToken', [dzPlayer.token]);
					}
				},
				error: () => {} // Fire and forget
			});

			return true;
		} catch (e) {
			error.log(e);
		}
	},

	restoreSetting: function(settings) {
		try {

			if (getSize(settings) == 0) {
				return false;
			}

			dzPlayer.hq = (typeof settings.site.player_hq == 'undefined' || settings.site.player_hq == null) ? (typeof USER != 'undefined' && USER.OPTIONS.web_hq) : (settings.site.player_hq && DZPS);

			dzPlayer.volume = storage.get('volume', 0.5);

			if (typeof settings.site.player_fade !== 'undefined') {
				dzPlayer.fade = settings.site.player_fade;
			}

			if (typeof settings.site.player_repeat !== 'undefined') {
				dzPlayer.repeat = settings.site.player_repeat;
			}

			if (typeof settings.site.player_shuffle !== 'undefined') {
				dzPlayer.shuffle = (typeof settings.site.player_shuffle === 'string') ? Boolean(parseInt(settings.site.player_shuffle, 10)) : settings.site.player_shuffle;
			}

			Events.trigger(Events.player.hq, dzPlayer.hq);
			Events.trigger(Events.player.volume, dzPlayer.volume);
			Events.trigger(Events.player.shuffle_changed, dzPlayer.shuffle);
			Events.trigger(Events.player.repeat_changed, dzPlayer.repeat);

			dzPlayer.control.changeFadeValue(dzPlayer.fade);
			dzPlayer.control.setVolume(dzPlayer.volume);
			dzPlayer.control.setHq(dzPlayer.hq);

			return true;

		} catch (e) {
			error.log(e);
		}
	},

	setAppId: function(app_id) {
		try {
			dzPlayer.appId = app_id;
		} catch (e) {
			error.log(e);
		}
	},

	setApp: function(app) {
		try {
			dzPlayer.appId = app.id;
			dzPlayer.appType = app.type;
		} catch (e) {
			error.log(e);
		}
	},

	setPropValue: function(propName, value) {
		try {

			if (propName === 'onError') {
				dzPlayer.control.stop();
				modal.open('/lightbox/error');

				return false;
			}

			if (propName === 'preloadComplete' || propName === 'preloadAborted') {
				Events.trigger(Events.player[propName], value);

				if (propName === 'preloadComplete') {
					dzPlayer.cached[value] = true;
				} else {
					delete dzPlayer.cached[value];
				}

				return false;
			}

			if (propName == 'duration' && value == 0) {
				return false;
			}

			if (propName == 'loadingStats') {
				if (value.partIndex <= 2 && value.sngId > 0 && value.sngId == dzPlayer.getCurrentSong('MEDIA_ID')) {
					dzPlayer.logTrack.ls[value.partIndex] = {
						duration: value.loadingTime,
						size: value.size,
						host: value.hostname
					};
				}

				return false;
			}

			if (propName == 'position' && value > 0) {

				if (dzPlayer.lastPosition != Math.floor(value)) {
					dzPlayer.logTrack.lt += 1;

					if (dzPlayer.getMediaType() === dzPlayer.MEDIA_TYPE_LIVE_STREAM && dzPlayer.logTrack.lt % dzPlayer.LOG_INTERVAL_LIVE_STREAM === 0) {
						// Log live stream every 'LOG_INTERVAL_LIVE_STREAM' seconds
						dzPlayer.logManager();
					}
				}
				dzPlayer.lastPosition = Math.floor(value);

				if (dzPlayer.getPlayerType() == 'ads') {
					Events.trigger(Events.player.adsVastPlaying, {position: value});
				}

				// PRECACHE NEXT SONG
				if (Math.floor(value) == dzPlayer.getDuration() - 20 &&
					!dzPlayer.isLimited() && dzPlayer.getPlayerType() != 'ads' &&
					dzPlayer.getPlayerType() != 'jingle') {

					const nextSong = dzPlayer.getNextSong();

					if (nextSong != null && nextSong.DURATION > 60 && typeof dzPlayer.cached[nextSong.SNG_ID] === 'undefined') {
						dzPlayer.cached[nextSong.SNG_ID] = false;
						dzPlayer.trigger('audioPlayer_preloadTrack', [[dzPlayer.getNextSong()]]);
					}
				}
			}

			// Broadcast finish track event before next track begin
			if (propName == 'finish') {
				Events.trigger(Events.player.track_end, value);
			}

			dzPlayer[propName] = value;

			// Debug //
			if (propName === 'user_status' && dzPlayer.user_status.limited && USER.USER_ID > 0) {
				const err = new Error('user_status limited:' + dzPlayer.token);
				err.name = 'DZPLAYER';
				throw err;
			}

			if (typeof Events.player[propName] !== 'string') {
				const err = new Error('Unknown Event : ' + JSON.stringify(arguments));
				err.name = 'DZPLAYER';
				throw err;
			}

			Events.trigger(Events.player[propName], value);

		} catch (e) {
			error.log(e);
		}
	},

	// --------------------------------------------------------------------------
	//  Private methods
	// --------------------------------------------------------------------------
	trigger: function(methodName, params) {
		try {
			if (dzPlayer.user_status.preview === false) {
				return false;
			}

			if (params == null) {
				params = [];
			}

			if (dzPlayer.playerLoaded) {

				if (chromecast.isLoading()) {
					return;
				}

				if (chromecast.isCasting() && params[0] !== 'flashAction') {
					chromecast.executeAction(methodName, params);
					return;
				}

				_executeActionscriptMethod('audioPlayerSWF', methodName, params);

			}

		} catch (e) {
			error.log(e);
		}
	},

	setForbiddenListen: function() {
		// Deprecated
	}
};

export default dzPlayer;
