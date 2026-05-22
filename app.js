(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const state = {
    library: [],
    albums: [],
    activeTab: 'songs',
    view: 'songs',
    albumId: null,
    currentTrackId: null,
    queue: [],
    currentIndex: -1,
    sortKey: 'title',
    sortDir: 1,
    searchQuery: '',
    repeatAlbum: false,
    lyricsOpen: true,
    queueOpen: false,
    currentDragId: null,
    currentAlbumCoverIndex: 0,
    loadToken: 0,
    folderHandle: null,
    autoNormalize: true,
    initializedAudio: false,
  };

  const els = {
    tabbar: $('#tabbar'),
    tabs: $$('.tab-btn'),
    crumb: $('#crumb'),
    screenTitle: $('#screenTitle'),
    sortBtn: $('#sortBtn'),
    sortMenu: $('#sortMenu'),
    songsView: $('#songsView'),
    albumsView: $('#albumsView'),
    searchView: $('#searchView'),
    albumView: $('#albumView'),
    playerView: $('#playerView'),
    songsList: $('#songsList'),
    albumsGrid: $('#albumsGrid'),
    searchList: $('#searchList'),
    albumSongsList: $('#albumSongsList'),
    queueList: $('#queueList'),
    songsCount: $('#songsCount'),
    albumsCount: $('#albumsCount'),
    searchInput: $('#searchInput'),
    folderNote: $('#folderNote'),
    playAllBtn: $('#playAllBtn'),
    shuffleAllBtn: $('#shuffleAllBtn'),
    pickFolderBtn: $('#pickFolderBtn'),
    importFilesBtn: $('#importFilesBtn'),
    fileInput: $('#fileInput'),
    albumBackBtn: $('#albumBackBtn'),
    albumHeroArt: $('#albumHeroArt'),
    albumHeroTitle: $('#albumHeroTitle'),
    albumHeroMeta: $('#albumHeroMeta'),
    playAlbumBtn: $('#playAlbumBtn'),
    shuffleAlbumBtn: $('#shuffleAlbumBtn'),
    playerBackBtn: $('#playerBackBtn'),
    miniPlayer: $('#miniPlayer'),
    miniBackBtn: $('#miniBackBtn'),
    miniArt: $('#miniArt'),
    miniTitle: $('#miniTitle'),
    miniArtist: $('#miniArtist'),
    miniPrevBtn: $('#miniPrevBtn'),
    miniPlayBtn: $('#miniPlayBtn'),
    miniNextBtn: $('#miniNextBtn'),
    miniExpandBtn: $('#miniExpandBtn'),
    playerArt: $('#playerArt'),
    playerTitle: $('#playerTitle'),
    playerArtist: $('#playerArtist'),
    playerAlbum: $('#playerAlbum'),
    reshuffleBtn: $('#reshuffleBtn'),
    lyricsBtn: $('#lyricsBtn'),
    queueBtn: $('#queueBtn'),
    loopAlbumBtn: $('#loopAlbumBtn'),
    seekSlider: $('#seekSlider'),
    timeNow: $('#timeNow'),
    timeEnd: $('#timeEnd'),
    volumeSlider: $('#volumeSlider'),
    volReadout: $('#volReadout'),
    bassSlider: $('#bassSlider'),
    midSlider: $('#midSlider'),
    trebleSlider: $('#trebleSlider'),
    lyricsPanel: $('#lyricsPanel'),
    lyricsText: $('#lyricsText'),
    queuePanel: $('#queuePanel'),
    audio: $('#audio'),
  };

  const dbPromise = openDB();

  let audioCtx = null;
  let mediaSource = null;
  let gainNode = null;
  let compressor = null;
  let bassFilter = null;
  let midFilter = null;
  let trebleFilter = null;
  let currentObjectUrl = null;
  let seekDragging = false;
  let queueDraggingId = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('folk-fawn-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet(store, key) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbSet(store, value, key) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = key !== undefined ? tx.objectStore(store).put(value, key) : tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAll(store) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(store, key) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function sanitizeText(v) {
    return (v ?? '').toString().trim();
  }

  function fallbackCover(letter = '♪') {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#3a3a3a" />
            <stop offset="100%" stop-color="#151515" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="72" fill="url(#g)" />
        <circle cx="180" cy="180" r="82" fill="#2c2c2c" opacity=".75" />
        <text x="50%" y="56%" text-anchor="middle" fill="#d3b18b" font-size="180" font-family="system-ui,Segoe UI,Arial" dominant-baseline="middle">${letter}</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function setImage(img, src, fallback = fallbackCover()) {
    img.onerror = () => { img.onerror = null; img.src = fallback; };
    img.src = src || fallback;
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function compareBy(key, a, b) {
    const dir = state.sortDir;
    const val = (obj) => {
      switch (key) {
        case 'artist': return sanitizeText(obj.artist).toLowerCase();
        case 'album': return sanitizeText(obj.album).toLowerCase();
        case 'year': return Number(obj.year) || 0;
        case 'dateAdded': return Number(obj.dateAdded) || 0;
        case 'title':
        default: return sanitizeText(obj.title).toLowerCase();
      }
    };
    const av = val(a);
    const bv = val(b);
    if (typeof av === 'number' || typeof bv === 'number') return (av - bv) * dir;
    return av.localeCompare(bv) * dir;
  }

  function getSortedLibrary(list = state.library) {
    return [...list].sort((a, b) => compareBy(state.sortKey, a, b) || sanitizeText(a.title).localeCompare(sanitizeText(b.title)));
  }

  function getFilteredLibrary() {
    const q = state.searchQuery.trim().toLowerCase();
    const lib = getSortedLibrary();
    if (!q) return lib;
    return lib.filter((t) => [t.title, t.artist, t.album, t.year, t.fileName].some((x) => sanitizeText(x).toLowerCase().includes(q)));
  }

  function groupAlbums(list = state.library) {
    const map = new Map();
    for (const track of list) {
      const key = track.albumId || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          album: track.album || 'Unknown Album',
          artist: track.artist || 'Unknown Artist',
          tracks: [],
          covers: [],
          year: track.year || '',
          dateAdded: track.dateAdded || 0,
        });
      }
      const album = map.get(key);
      album.tracks.push(track);
      if (track.coverDataUrl) album.covers.push(track.coverDataUrl);
      if (track.year && (!album.year || Number(track.year) < Number(album.year))) album.year = track.year;
      if (track.dateAdded < album.dateAdded) album.dateAdded = track.dateAdded;
    }
    return [...map.values()];
  }

  function sortAlbums(list) {
    const dir = state.sortDir;
    const key = state.sortKey;
    return [...list].sort((a, b) => {
      const pick = (album) => {
        switch (key) {
          case 'artist': return sanitizeText(album.artist).toLowerCase();
          case 'album': return sanitizeText(album.album).toLowerCase();
          case 'year': return Number(album.year) || 0;
          case 'dateAdded': return Number(album.dateAdded) || 0;
          case 'title':
          default: return sanitizeText(album.album).toLowerCase();
        }
      };
      const av = pick(a); const bv = pick(b);
      if (typeof av === 'number' || typeof bv === 'number') return (av - bv) * dir;
      return av.localeCompare(bv) * dir;
    });
  }

  function displayTab(tab) {
    state.activeTab = tab;
    state.view = tab;
    state.albumId = null;
    $$('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-current', btn.dataset.tab === tab ? 'page' : 'false');
    });
    $('#songsView').classList.toggle('active', tab === 'songs');
    $('#albumsView').classList.toggle('active', tab === 'albums');
    $('#searchView').classList.toggle('active', tab === 'search');
    $('#albumView').classList.remove('active');
    $('#playerView').classList.remove('active');
    $('#crumb').textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
    $('#screenTitle').textContent = tab === 'songs' ? 'Folk Fawn' : tab.charAt(0).toUpperCase() + tab.slice(1);
    $('#sortBtn').style.display = (tab === 'songs' || tab === 'albums') ? 'inline-flex' : 'none';
    renderAll();
  }

  function openAlbum(albumId) {
    const album = groupAlbums().find((a) => a.id === albumId);
    if (!album) return;
    state.view = 'album';
    state.albumId = albumId;
    $('#songsView').classList.remove('active');
    $('#albumsView').classList.remove('active');
    $('#searchView').classList.remove('active');
    $('#playerView').classList.remove('active');
    $('#albumView').classList.add('active');
    $('#crumb').textContent = 'Album';
    $('#screenTitle').textContent = album.album;
    const cover = albumCoverFor(album);
    setImage(els.albumHeroArt, cover);
    $('#albumHeroTitle').textContent = album.album;
    $('#albumHeroMeta').textContent = `${album.artist || 'Unknown Artist'} • ${album.tracks.length} song${album.tracks.length === 1 ? '' : 's'}`;
    els.albumHeroArt.onclick = () => cycleAlbumCover(albumId);
    renderAlbumSongs(album);
  }

  function openPlayer() {
    state.view = 'player';
    $('#songsView').classList.remove('active');
    $('#albumsView').classList.remove('active');
    $('#searchView').classList.remove('active');
    $('#albumView').classList.remove('active');
    $('#playerView').classList.add('active');
    $('#crumb').textContent = 'Now Playing';
    $('#screenTitle').textContent = 'Now Playing';
    updatePlayerView();
  }

  function closePlayerToMini() {
    if (!state.currentTrackId) {
      displayTab(state.activeTab || 'songs');
      return;
    }
    state.view = 'mini';
    $('#playerView').classList.remove('active');
    $('#albumView').classList.remove('active');
    $('#songsView').classList.toggle('active', state.activeTab === 'songs');
    $('#albumsView').classList.toggle('active', state.activeTab === 'albums');
    $('#searchView').classList.toggle('active', state.activeTab === 'search');
    $('#miniPlayer').classList.remove('hidden');
    $('#sortBtn').style.display = (state.activeTab === 'songs' || state.activeTab === 'albums') ? 'inline-flex' : 'none';
    renderAll();
  }

  function backFromAlbumOrPlayer() {
    if (state.view === 'player' || state.view === 'mini') {
      closePlayerToMini();
      return;
    }
    if (state.view === 'album') {
      displayTab(state.activeTab || 'songs');
    }
  }

  function albumCoverFor(album) {
    if (album.covers && album.covers.length) {
      const index = Math.abs(state.currentAlbumCoverIndex) % album.covers.length;
      return album.covers[index];
    }
    return fallbackCover(album.album?.[0] || '♪');
  }

  function cycleAlbumCover(albumId) {
    const album = groupAlbums().find((a) => a.id === albumId);
    if (!album || !album.covers.length) return;
    state.currentAlbumCoverIndex = (state.currentAlbumCoverIndex + 1) % album.covers.length;
    setImage(els.albumHeroArt, albumCoverFor(album));
    toast('Album cover updated for this view');
  }

  function renderSongs() {
    const items = getFilteredLibrary();
    els.songsCount.textContent = `${items.length} song${items.length === 1 ? '' : 's'} in view`;
    els.songsList.innerHTML = items.map((t) => songRowHTML(t, true, false)).join('') || emptyState('No songs found.');
    bindSongRows(els.songsList, items);
  }

  function renderSearchResults() {
    const items = getFilteredLibrary();
    els.searchList.innerHTML = items.map((t) => songRowHTML(t, true, false)).join('') || emptyState('No matching songs yet.');
    bindSongRows(els.searchList, items);
  }

  function renderAlbums() {
    const albums = sortAlbums(groupAlbums());
    els.albumsCount.textContent = `${albums.length} album${albums.length === 1 ? '' : 's'} in library`;
    els.albumsGrid.innerHTML = albums.map((album) => albumCardHTML(album)).join('') || emptyState('No albums found.');
    $$('.album-card', els.albumsGrid).forEach((card) => {
      card.addEventListener('click', () => openAlbum(card.dataset.albumId));
    });
  }

  function renderAlbumSongs(album) {
    const tracks = [...album.tracks].sort((a, b) => a.trackNumber - b.trackNumber || a.title.localeCompare(b.title));
    els.albumSongsList.innerHTML = tracks.map((t) => songRowHTML(t, true, false)).join('') || emptyState('No songs in this album.');
    bindSongRows(els.albumSongsList, tracks, album.id);
  }

  function renderQueue() {
    if (!state.currentTrackId) {
      els.queueList.innerHTML = emptyState('Queue is empty.');
      return;
    }
    const q = state.queue.map((id) => findTrack(id)).filter(Boolean);
    els.queueList.innerHTML = q.map((t, idx) => queueRowHTML(t, idx)).join('');
    $$('.queue-row', els.queueList).forEach((row) => {
      row.draggable = true;
      row.dataset.trackId = row.dataset.trackId || row.getAttribute('data-track-id');
      row.addEventListener('dragstart', onQueueDragStart);
      row.addEventListener('dragover', onQueueDragOver);
      row.addEventListener('drop', onQueueDrop);
      row.addEventListener('dragend', onQueueDragEnd);
      const remove = $('.queue-remove', row);
      if (remove) remove.addEventListener('click', () => removeFromQueue(row.dataset.trackId));
      const play = $('.queue-play', row);
      if (play) play.addEventListener('click', () => playTrackById(row.dataset.trackId, state.queue, queueIndexById(row.dataset.trackId)));
    });
  }

  function songRowHTML(track, showQueueButton = true, showRemove = false) {
    const current = track.id === state.currentTrackId;
    return `
      <article class="song-row ${current ? 'current' : ''}" data-track-id="${track.id}">
        <img class="song-cover" src="${escapeAttr(track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'))}" alt="" />
        <div class="song-meta">
          <div class="song-title">${escapeHtml(track.title || track.fileName || 'Untitled')}</div>
          <div class="song-artist">${escapeHtml(track.artist || 'Unknown Artist')} · ${escapeHtml(track.album || 'Unknown Album')}</div>
        </div>
        <div class="item-actions">
          ${showQueueButton ? `<button class="icon-btn queue-add" title="Queue song">＋</button>` : ''}
          <button class="icon-btn play-song" title="Play song">▶</button>
        </div>
      </article>`;
  }

  function albumCardHTML(album) {
    const cover = albumCoverFor(album);
    return `
      <article class="album-card" data-album-id="${album.id}">
        <img src="${escapeAttr(cover)}" alt="${escapeHtml(album.album)} album art" />
        <div class="album-title">${escapeHtml(album.album)}</div>
        <div class="album-sub">${escapeHtml(album.artist || 'Unknown Artist')} · ${album.tracks.length} songs</div>
      </article>`;
  }

  function queueRowHTML(track, idx) {
    const current = track.id === state.currentTrackId;
    return `
      <article class="queue-row ${current ? 'current' : ''}" data-track-id="${track.id}" draggable="true">
        <div class="queue-handle" title="Drag to reorder">⠿</div>
        <img class="queue-cover" src="${escapeAttr(track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'))}" alt="" />
        <div class="queue-meta">
          <div class="queue-title">${escapeHtml(current ? `${track.title || 'Untitled'} (Now Playing)` : track.title || 'Untitled')}</div>
          <div class="queue-sub">${escapeHtml(track.artist || 'Unknown Artist')} · ${escapeHtml(track.album || 'Unknown Album')}</div>
        </div>
        <div class="item-actions">
          <button class="icon-btn queue-play" title="Play this song">▶</button>
          <button class="icon-btn queue-remove" title="Remove">⊖</button>
        </div>
      </article>`;
  }

  function emptyState(text) {
    return `<div class="import-note">${escapeHtml(text)}</div>`;
  }

  function escapeHtml(s) {
    return sanitizeText(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll('`', '&#96;');
  }

  function bindSongRows(root, items, albumId = null) {
    $$('.song-row', root).forEach((row) => {
      const id = row.dataset.trackId;
      const song = findTrack(id);
      if (!song) return;
      row.addEventListener('click', (e) => {
        const isButton = e.target.closest('button');
        if (isButton?.classList.contains('queue-add')) return;
        if (isButton?.classList.contains('play-song')) return;
        const queue = albumId ? items : items;
        playTrackById(id, queue.map((t) => t.id), queue.findIndex((t) => t.id === id));
      });
      const playBtn = $('.play-song', row);
      if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); playTrackById(id, items.map((t) => t.id), items.findIndex((t) => t.id === id)); });
      const queueBtn = $('.queue-add', row);
      if (queueBtn) queueBtn.addEventListener('click', (e) => { e.stopPropagation(); addToQueueAfterCurrent(id); });
    });
  }

  function renderAll() {
    renderSongs();
    renderAlbums();
    renderSearchResults();
    renderMiniPlayer();
    renderQueue();
    updateSortMenuLabel();
  }

  function updateSortMenuLabel() {
    $('#sortBtn').textContent = `${prettySortKey(state.sortKey)} ${state.sortDir === 1 ? '▾' : '▴'}`;
  }

  function prettySortKey(key) {
    return {
      title: 'Title', artist: 'Artist', album: 'Album', year: 'Year Released', dateAdded: 'Date Added'
    }[key] || 'Title';
  }

  function findTrack(id) {
    return state.library.find((t) => t.id === id) || null;
  }

  function queueIndexById(id) {
    return state.queue.indexOf(id);
  }

  function setQueue(ids, startIndex = 0, mode = 'songs', albumId = null) {
    state.queue = ids.filter(Boolean);
    state.currentIndex = Math.max(0, Math.min(startIndex, state.queue.length - 1));
    state.currentTrackId = state.queue[state.currentIndex] || null;
    state.repeatAlbum = mode === 'album' && !!albumId;
    state.currentAlbumId = albumId;
    updateLoopButton();
    loadCurrentTrack();
    renderAll();
  }

  function playTrackById(id, ids = null, index = null, mode = 'songs', albumId = null) {
    const queueIds = ids?.length ? ids : state.library.map((t) => t.id);
    const startIndex = index ?? queueIds.indexOf(id);
    setQueue(queueIds, startIndex, mode, albumId);
    openPlayer();
    startPlayback();
  }

  async function startPlayback() {
    const track = findTrack(state.currentTrackId);
    if (!track) return;
    await ensureAudioGraph();
    const url = await makeObjectUrl(track);
    if (!url) return;
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = url;
    els.audio.src = url;
    els.audio.currentTime = 0;
    await els.audio.play();
    renderMiniPlayer();
    updatePlayerView();
  }

  async function makeObjectUrl(track) {
    if (!track?.file) return null;
    return URL.createObjectURL(track.file);
  }

  async function ensureAudioGraph() {
    if (state.initializedAudio) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    mediaSource = audioCtx.createMediaElementSource(els.audio);
    gainNode = audioCtx.createGain();
    compressor = audioCtx.createDynamicsCompressor();
    bassFilter = audioCtx.createBiquadFilter();
    midFilter = audioCtx.createBiquadFilter();
    trebleFilter = audioCtx.createBiquadFilter();

    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 180;
    midFilter.type = 'peaking';
    midFilter.frequency.value = 1200;
    midFilter.Q.value = 1;
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 5000;
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;

    mediaSource.connect(gainNode);
    gainNode.connect(bassFilter);
    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    trebleFilter.connect(compressor);
    compressor.connect(audioCtx.destination);
    applyMasterGain();
    state.initializedAudio = true;
  }

  function applyMasterGain() {
    if (!gainNode) return;
    const track = findTrack(state.currentTrackId);
    const norm = (state.autoNormalize && track?.normGain) ? track.normGain : 1;
    gainNode.gain.value = (Number(els.volumeSlider.value) / 100) * norm;
  }

  function loadCurrentTrack() {
    const track = findTrack(state.currentTrackId);
    if (!track) return;
    updatePlayerView();
    renderMiniPlayer();
    if (state.view === 'album') openAlbum(state.albumId);
  }

  function updatePlayerView() {
    const track = findTrack(state.currentTrackId);
    if (!track) {
      els.playerTitle.textContent = 'Nothing playing';
      els.playerArtist.textContent = '';
      els.playerAlbum.textContent = '';
      setImage(els.playerArt, fallbackCover());
      setImage(els.miniArt, fallbackCover());
      els.miniTitle.textContent = 'Nothing playing';
      els.miniArtist.textContent = '';
      return;
    }
    els.playerTitle.textContent = track.title || 'Untitled';
    els.playerArtist.textContent = track.artist || 'Unknown Artist';
    els.playerAlbum.textContent = track.album || 'Unknown Album';
    setImage(els.playerArt, track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'));
    setImage(els.miniArt, track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'));
    $('#lyricsText').textContent = track.lyrics?.trim() || 'No embedded lyrics found.';
    updateLoopButton();
    updateTimeUi();
  }

  function renderMiniPlayer() {
    const track = findTrack(state.currentTrackId);
    if (!track) {
      els.miniPlayer.classList.add('hidden');
      return;
    }
    els.miniPlayer.classList.remove('hidden');
    setImage(els.miniArt, track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'));
    els.miniTitle.textContent = track.title || 'Untitled';
    els.miniArtist.textContent = `${track.artist || 'Unknown Artist'} · ${track.album || 'Unknown Album'}`;
    els.miniPlayBtn.textContent = els.audio.paused ? '▶' : '⏸';
  }

  function updateTimeUi() {
    const duration = els.audio.duration || 0;
    const cur = els.audio.currentTime || 0;
    els.timeNow.textContent = formatTime(cur);
    els.timeEnd.textContent = formatTime(duration);
    els.seekSlider.value = duration ? Math.round((cur / duration) * 1000) : 0;
  }

  function updateLoopButton() {
    els.loopAlbumBtn.textContent = state.repeatAlbum ? 'Looping Album' : 'Loop Album';
    els.loopAlbumBtn.disabled = !state.currentAlbumId;
    els.loopAlbumBtn.style.opacity = state.currentAlbumId ? '1' : '.5';
  }

  function addToQueueAfterCurrent(id) {
    if (!id) return;
    const existing = state.queue.filter((x) => x !== id);
    const insertAt = Math.max(0, state.currentIndex + 1);
    existing.splice(insertAt, 0, id);
    state.queue = existing;
    renderQueue();
    toast('Added to queue');
  }

  function removeFromQueue(id) {
    if (!id || id === state.currentTrackId) return;
    const idx = state.queue.indexOf(id);
    if (idx === -1) return;
    state.queue.splice(idx, 1);
    if (idx < state.currentIndex) state.currentIndex -= 1;
    renderQueue();
  }

  function shuffleQueue(keepCurrent = true) {
    const currentId = state.currentTrackId;
    let ids = [...state.queue];
    if (keepCurrent && currentId) {
      ids = ids.filter((x) => x !== currentId);
      fisherYates(ids);
      ids.unshift(currentId);
      state.currentIndex = 0;
    } else {
      fisherYates(ids);
      state.currentIndex = 0;
      state.currentTrackId = ids[0] || null;
    }
    state.queue = ids;
    renderQueue();
    toast('Queue reshuffled');
  }

  function fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function goNext() {
    if (!state.queue.length) return;
    if (state.currentIndex < state.queue.length - 1) {
      state.currentIndex += 1;
      state.currentTrackId = state.queue[state.currentIndex];
      await startPlayback();
      return;
    }
    if (state.repeatAlbum && state.currentAlbumId) {
      const albumTracks = groupAlbums().find((a) => a.id === state.currentAlbumId)?.tracks || [];
      const ids = albumTracks.map((t) => t.id);
      setQueue(ids, 0, 'album', state.currentAlbumId);
      await startPlayback();
    }
  }

  async function goPrev() {
    if (!state.queue.length) return;
    if (els.audio.currentTime > 3) {
      els.audio.currentTime = 0;
      return;
    }
    if (state.currentIndex > 0) {
      state.currentIndex -= 1;
      state.currentTrackId = state.queue[state.currentIndex];
      await startPlayback();
    }
  }

  function toast(msg) {
    let node = $('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = msg;
    node.classList.remove('hidden');
    clearTimeout(node._t);
    node._t = setTimeout(() => node.classList.add('hidden'), 1600);
  }

  async function scanFile(file) {
    const meta = await parseMp3Metadata(file);
    const albumId = `${sanitizeText(meta.album).toLowerCase()}__${sanitizeText(meta.artist).toLowerCase()}` || 'unknown';
    const track = {
      id: uid(),
      file,
      fileName: file.name,
      title: meta.title || stripExt(file.name),
      artist: meta.artist || 'Unknown Artist',
      album: meta.album || 'Unknown Album',
      year: meta.year || '',
      trackNumber: meta.trackNumber || 0,
      dateAdded: Date.now(),
      coverDataUrl: meta.coverDataUrl || null,
      lyrics: meta.lyrics || '',
      albumId,
      normGain: meta.normGain || 1,
      duration: meta.duration || 0,
    };
    return track;
  }

  function stripExt(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  async function parseMp3Metadata(file) {
    const buffer = await file.arrayBuffer();
    const parsed = parseID3(buffer);
    let duration = 0;
    let rmsGain = 1;
    if (window.AudioContext || window.webkitAudioContext) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ac.decodeAudioData(buffer.slice(0));
        duration = audioBuffer.duration || 0;
        rmsGain = computeNormalizationGain(audioBuffer, -14);
        await ac.close?.();
      } catch (_) {
        // ignore decode failures; metadata still usable.
      }
    }
    return { ...parsed, duration, normGain: rmsGain };
  }

  function computeNormalizationGain(audioBuffer, targetDb = -14) {
    try {
      const channel = audioBuffer.getChannelData(0);
      const step = Math.max(1, Math.floor(channel.length / 20000));
      let sum = 0;
      let count = 0;
      for (let i = 0; i < channel.length; i += step) {
        const s = channel[i];
        sum += s * s;
        count += 1;
      }
      const rms = Math.sqrt(sum / Math.max(1, count));
      const db = 20 * Math.log10(Math.max(rms, 1e-5));
      const diff = targetDb - db;
      const gain = Math.min(3, Math.max(0.4, Math.pow(10, diff / 20)));
      return gain;
    } catch {
      return 1;
    }
  }

  function parseID3(buffer) {
    const view = new DataView(buffer);
    const sig = String.fromCharCode(...new Uint8Array(buffer, 0, 3));
    if (sig !== 'ID3') return { title: '', artist: '', album: '', year: '', trackNumber: 0, coverDataUrl: '', lyrics: '' };
    const version = view.getUint8(3);
    const flags = view.getUint8(5);
    const size = syncSafeToInt(view.getUint8(6), view.getUint8(7), view.getUint8(8), view.getUint8(9));
    let offset = 10;
    if (flags & 0x40) offset += 4; // extended header not fully parsed
    const end = Math.min(buffer.byteLength, 10 + size);
    const frames = {};
    let coverDataUrl = '';
    let lyrics = '';
    while (offset + 10 <= end) {
      const id = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
      if (!/^[A-Z0-9]{4}$/.test(id) || id === '\u0000\u0000\u0000\u0000') break;
      const frameSize = version === 4 ? syncSafeToInt(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7)) : view.getUint32(offset + 4, false);
      if (frameSize <= 0) break;
      const dataStart = offset + 10;
      const dataEnd = dataStart + frameSize;
      const frame = buffer.slice(dataStart, dataEnd);
      if (['TIT2', 'TPE1', 'TALB', 'TRCK', 'TYER', 'TDRC', 'USLT'].includes(id)) {
        const text = decodeId3Text(frame);
        if (id === 'TIT2') frames.title = text;
        if (id === 'TPE1') frames.artist = text;
        if (id === 'TALB') frames.album = text;
        if (id === 'TRCK') frames.trackNumber = parseInt(text.split('/')[0], 10) || 0;
        if (id === 'TYER' || id === 'TDRC') frames.year = String(text).slice(0, 4);
        if (id === 'USLT') lyrics = text;
      } else if (id === 'APIC' && !coverDataUrl) {
        const pic = decodeApic(frame);
        if (pic) coverDataUrl = pic;
      }
      offset = dataEnd;
    }
    return { ...frames, coverDataUrl, lyrics };
  }

  function syncSafeToInt(b1, b2, b3, b4) {
    return (b1 & 0x7f) << 21 | (b2 & 0x7f) << 14 | (b3 & 0x7f) << 7 | (b4 & 0x7f);
  }

  function decodeId3Text(frame) {
    const bytes = new Uint8Array(frame);
    if (!bytes.length) return '';
    const encoding = bytes[0];
    const data = bytes.slice(1);
    if (encoding === 0) return new TextDecoder('iso-8859-1').decode(data).replace(/\u0000+$/, '').trim();
    if (encoding === 1) return decodeUtf16(data).trim();
    if (encoding === 2) return new TextDecoder('utf-16be').decode(data).replace(/\u0000+$/, '').trim();
    return new TextDecoder().decode(data).replace(/\u0000+$/, '').trim();
  }

  function decodeUtf16(bytes) {
    if (bytes.length >= 2) {
      const bom = (bytes[0] << 8) | bytes[1];
      if (bom === 0xfeff) return new TextDecoder('utf-16le').decode(bytes.slice(2)).replace(/\u0000+$/, '');
      if (bom === 0xfffe) return new TextDecoder('utf-16be').decode(bytes.slice(2)).replace(/\u0000+$/, '');
    }
    return new TextDecoder('utf-16le').decode(bytes).replace(/\u0000+$/, '');
  }

  function decodeApic(frame) {
    try {
      const bytes = new Uint8Array(frame);
      const encoding = bytes[0];
      let i = 1;
      let mime = '';
      while (i < bytes.length && bytes[i] !== 0) mime += String.fromCharCode(bytes[i++]);
      i += 1;
      i += 1; // picture type
      let descEnd = i;
      if (encoding === 0 || encoding === 3) {
        while (descEnd < bytes.length && bytes[descEnd] !== 0) descEnd += 1;
        descEnd += 1;
      } else {
        while (descEnd + 1 < bytes.length && !(bytes[descEnd] === 0 && bytes[descEnd + 1] === 0)) descEnd += 2;
        descEnd += 2;
      }
      const image = bytes.slice(descEnd);
      const mimeType = mime || 'image/jpeg';
      const blob = new Blob([image], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch {
      return '';
    }
  }

  function updateSortState(key) {
    if (state.sortKey === key) {
      state.sortDir *= -1;
    } else {
      state.sortKey = key;
      state.sortDir = 1;
    }
    renderAll();
  }

  async function importFiles(files, remember = false) {
    const list = Array.from(files || []).filter((f) => /\.(mp3|mpeg)$/i.test(f.name) || f.type === 'audio/mpeg');
    if (!list.length) {
      toast('No MP3 files found');
      return;
    }
    toast(`Importing ${list.length} file${list.length === 1 ? '' : 's'}...`);
    const imported = [];
    for (const file of list) {
      const track = await scanFile(file);
      imported.push(track);
      state.library.push(track);
      await dbSet('tracks', track);
    }
    if (remember) await rememberFolderHint('Imported files loaded');
    renderAll();
    toast(`Imported ${imported.length} track${imported.length === 1 ? '' : 's'}`);
  }

  async function scanDirectoryHandle(dirHandle) {
    const files = [];
    async function walk(handle, path = '') {
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind === 'file' && /\.(mp3|mpeg)$/i.test(name)) {
          const file = await entry.getFile();
          files.push(file);
        } else if (entry.kind === 'directory') {
          await walk(entry, `${path}${name}/`);
        }
      }
    }
    await walk(dirHandle);
    return files;
  }

  async function chooseFolder() {
    if (!('showDirectoryPicker' in window)) {
      toast('Folder picker not supported here. Use file import instead.');
      return;
    }
    const dir = await window.showDirectoryPicker({ mode: 'read' });
    await dbSet('prefs', dir, 'musicFolderHandle');
    state.folderHandle = dir;
    const files = await scanDirectoryHandle(dir);
    await importFiles(files, true);
    els.folderNote.textContent = `Loaded ${files.length} files from the selected folder.`;
  }

  async function rememberFolderHint(text) {
    els.folderNote.textContent = text;
  }

  async function restoreSavedFolder() {
    try {
      const dir = await dbGet('prefs', 'musicFolderHandle');
      if (!dir) return;
      state.folderHandle = dir;
      els.folderNote.textContent = 'Last selected folder is remembered. Tap “Select Music Folder” to rescan it.';
    } catch {
      // ignore
    }
  }

  async function loadLibrary() {
    try {
      const tracks = await dbGetAll('tracks');
      state.library = tracks.sort((a, b) => a.dateAdded - b.dateAdded);
      await restoreSavedFolder();
      if (!state.library.length) els.folderNote.textContent = 'No songs loaded yet. Import MP3 files or choose a folder.';
      renderAll();
    } catch (err) {
      console.error(err);
      els.folderNote.textContent = 'Library unavailable. IndexedDB may be blocked in this browser.';
    }
  }

  function clearOverlayViews() {
    $('#albumView').classList.remove('active');
    $('#playerView').classList.remove('active');
  }

  function bindEvents() {
    els.tabs.forEach((btn) => btn.addEventListener('click', () => displayTab(btn.dataset.tab)));
    els.sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.sortMenu.classList.toggle('hidden');
      els.sortBtn.setAttribute('aria-expanded', String(!els.sortMenu.classList.contains('hidden')));
    });
    els.sortMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-sort]');
      if (!btn) return;
      updateSortState(btn.dataset.sort);
      els.sortMenu.classList.add('hidden');
      els.sortBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', () => {
      els.sortMenu.classList.add('hidden');
      els.sortBtn.setAttribute('aria-expanded', 'false');
    });
    els.playAllBtn.addEventListener('click', () => {
      const ids = getFilteredLibrary().map((t) => t.id);
      if (!ids.length) return toast('No songs to play');
      setQueue(ids, 0, 'songs');
      openPlayer();
      startPlayback();
    });
    els.shuffleAllBtn.addEventListener('click', () => {
      const ids = getFilteredLibrary().map((t) => t.id);
      if (!ids.length) return toast('No songs to shuffle');
      fisherYates(ids);
      setQueue(ids, 0, 'songs');
      openPlayer();
      startPlayback();
    });
    els.pickFolderBtn.addEventListener('click', chooseFolder);
    els.importFilesBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', async () => {
      await importFiles(els.fileInput.files);
      els.fileInput.value = '';
    });
    els.searchInput.addEventListener('input', () => { state.searchQuery = els.searchInput.value; renderSearchResults(); renderSongs(); });
    els.albumBackBtn.addEventListener('click', () => displayTab('albums'));
    els.playAlbumBtn.addEventListener('click', () => {
      const album = groupAlbums().find((a) => a.id === state.albumId);
      if (!album) return;
      const ids = [...album.tracks].sort((a, b) => a.trackNumber - b.trackNumber || a.title.localeCompare(b.title)).map((t) => t.id);
      setQueue(ids, 0, 'album', album.id);
      openPlayer();
      startPlayback();
    });
    els.shuffleAlbumBtn.addEventListener('click', () => {
      const album = groupAlbums().find((a) => a.id === state.albumId);
      if (!album) return;
      const ids = album.tracks.map((t) => t.id);
      fisherYates(ids);
      setQueue(ids, 0, 'album', album.id);
      openPlayer();
      startPlayback();
    });
    els.playerBackBtn.addEventListener('click', closePlayerToMini);
    els.miniBackBtn.addEventListener('click', closePlayerToMini);
    els.miniPlayBtn.addEventListener('click', togglePlayPause);
    els.miniNextBtn.addEventListener('click', goNext);
    els.miniPrevBtn.addEventListener('click', goPrev);
    els.miniExpandBtn.addEventListener('click', openPlayer);
    els.reshuffleBtn.addEventListener('click', () => shuffleQueue(true));
    els.lyricsBtn.addEventListener('click', () => {
      state.lyricsOpen = !state.lyricsOpen;
      els.lyricsPanel.classList.toggle('hidden', !state.lyricsOpen);
    });
    els.queueBtn.addEventListener('click', () => {
      state.queueOpen = !state.queueOpen;
      els.queuePanel.classList.toggle('hidden', !state.queueOpen);
      renderQueue();
    });
    els.loopAlbumBtn.addEventListener('click', () => {
      if (!state.currentAlbumId) return;
      state.repeatAlbum = !state.repeatAlbum;
      updateLoopButton();
      toast(state.repeatAlbum ? 'Album loop enabled' : 'Album loop disabled');
    });
    els.seekSlider.addEventListener('input', () => {
      seekDragging = true;
      const duration = els.audio.duration || 0;
      if (duration) {
        const pos = (Number(els.seekSlider.value) / 1000) * duration;
        els.timeNow.textContent = formatTime(pos);
      }
    });
    els.seekSlider.addEventListener('change', () => {
      const duration = els.audio.duration || 0;
      if (duration) els.audio.currentTime = (Number(els.seekSlider.value) / 1000) * duration;
      seekDragging = false;
    });
    els.volumeSlider.addEventListener('input', () => {
      els.volReadout.textContent = `${els.volumeSlider.value}%`;
      applyMasterGain();
    });
    [els.bassSlider, els.midSlider, els.trebleSlider].forEach((slider) => slider.addEventListener('input', applyEQ));
    els.audio.addEventListener('timeupdate', () => {
      if (!seekDragging) updateTimeUi();
      renderMiniPlayer();
    });
    els.audio.addEventListener('loadedmetadata', () => updateTimeUi());
    els.audio.addEventListener('ended', goNext);
    els.audio.addEventListener('play', () => renderMiniPlayer());
    els.audio.addEventListener('pause', () => renderMiniPlayer());
    els.audio.addEventListener('error', () => toast('Could not play this file'));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.sortMenu.classList.contains('hidden')) els.sortMenu.classList.add('hidden');
        else if (state.view === 'player') closePlayerToMini();
        else if (state.view === 'album') displayTab(state.activeTab || 'songs');
      }
    });
    bindSwipe();
    els.queueList.addEventListener('dragover', (e) => e.preventDefault());
  }

  function applyEQ() {
    if (!bassFilter || !midFilter || !trebleFilter) return;
    bassFilter.gain.value = Number(els.bassSlider.value);
    midFilter.gain.value = Number(els.midSlider.value);
    trebleFilter.gain.value = Number(els.trebleSlider.value);
  }

  async function togglePlayPause() {
    if (!state.currentTrackId) {
      const ids = getFilteredLibrary().map((t) => t.id);
      if (!ids.length) return;
      setQueue(ids, 0, 'songs');
      await startPlayback();
      openPlayer();
      return;
    }
    if (els.audio.paused) {
      if (!els.audio.src) await startPlayback(); else await els.audio.play();
    } else {
      els.audio.pause();
    }
  }

  function bindSwipe() {
    let startX = 0, startY = 0, active = false;
    const threshold = 60;
    document.addEventListener('touchstart', (e) => {
      if (e.target.closest('.queue-row') || e.target.closest('input') || e.target.closest('button')) return;
      const t = e.changedTouches[0];
      startX = t.clientX; startY = t.clientY; active = true;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!active) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      active = false;
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;
      const order = ['songs', 'albums', 'search'];
      const idx = order.indexOf(state.activeTab);
      if (dx < 0 && idx < order.length - 1) displayTab(order[idx + 1]);
      if (dx > 0 && idx > 0) displayTab(order[idx - 1]);
    }, { passive: true });
  }

  function onQueueDragStart(e) {
    const row = e.currentTarget;
    queueDraggingId = row.dataset.trackId;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', queueDraggingId);
  }

  function onQueueDragOver(e) {
    e.preventDefault();
    const target = e.currentTarget;
    if (!queueDraggingId || target.dataset.trackId === queueDraggingId) return;
  }

  function onQueueDrop(e) {
    e.preventDefault();
    const targetRow = e.currentTarget;
    const targetId = targetRow.dataset.trackId;
    if (!queueDraggingId || !targetId || queueDraggingId === targetId) return;
    const from = state.queue.indexOf(queueDraggingId);
    const to = state.queue.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = state.queue.splice(from, 1);
    state.queue.splice(to, 0, moved);
    state.currentIndex = state.queue.indexOf(state.currentTrackId);
    renderQueue();
  }

  function onQueueDragEnd(e) {
    const row = e.currentTarget;
    row.classList.remove('dragging');
    queueDraggingId = null;
  }

  async function hydrateFromStorage() {
    const all = await dbGetAll('tracks');
    if (all.length) state.library = all;
  }

  // Init
  bindEvents();
  displayTab('songs');
  els.lyricsPanel.classList.remove('hidden');
  state.lyricsOpen = true;
  els.queuePanel.classList.add('hidden');
  loadLibrary().then(() => {
    if (state.library.length) toast('Library loaded');
    renderAll();
  });
  els.volReadout.textContent = `${els.volumeSlider.value}%`;
  applyEQ();
  updateTimeUi();
  setImage(els.albumHeroArt, fallbackCover());
  setImage(els.playerArt, fallbackCover());
  setImage(els.miniArt, fallbackCover());
})();
