(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    library: [],
    queue: [],
    currentIndex: -1,
    currentTrackId: null,
    activeTab: 'songs',
    view: 'songs',
    albumId: null,
    sortKey: 'title',
    sortDir: 1,
    searchQuery: '',
    repeatAlbum: false,
    currentAlbumId: null,
    albumCoverIndex: new Map(),
    folderHandle: null,
    autoNormalize: true,
    audioReady: false,
    currentQueueMode: 'songs',
    directAudioMode: false,
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
    folderInput: $('#folderInput'),
    albumBackBtn: $('#albumBackBtn'),
    albumHeroArt: $('#albumHeroArt'),
    albumHeroTitle: $('#albumHeroTitle'),
    albumHeroMeta: $('#albumHeroMeta'),
    playAlbumBtn: $('#playAlbumBtn'),
    shuffleAlbumBtn: $('#shuffleAlbumBtn'),
    playerBackBtn: $('#playerBackBtn'),
    miniPlayer: $('#miniPlayer'),
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
    loopAlbumBtn: $('#loopAlbumBtn'),
    seekSlider: $('#seekSlider'),
    timeNow: $('#timeNow'),
    timeEnd: $('#timeEnd'),
    volumeSlider: $('#volumeSlider'),
    volReadout: $('#volReadout'),
    bassSlider: $('#bassSlider'),
    midSlider: $('#midSlider'),
    trebleSlider: $('#trebleSlider'),
    lyricsText: $('#lyricsText'),
    audio: $('#audio'),
  };

  const dbPromise = openDB();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  state.directAudioMode = false;
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
  let queueDragOverId = null;

  const DEFAULT_ART = svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#2b3139"/>
          <stop offset="100%" stop-color="#14181d"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill="url(#g)"/>
      <path d="M168 385c72-58 148-58 176 0" fill="none" stroke="#d9b48d" stroke-width="18" stroke-linecap="round"/>
      <path d="M212 385V134M256 385V110M300 385V134" stroke="#f2f2f2" stroke-width="8" stroke-linecap="round"/>
      <path d="M178 160c-25 18-40 48-40 82 0 54 35 96 92 122" fill="none" stroke="#d9b48d" stroke-width="18" stroke-linecap="round"/>
      <path d="M334 160c25 18 40 48 40 82 0 54-35 96-92 122" fill="none" stroke="#d9b48d" stroke-width="18" stroke-linecap="round"/>
    </svg>`);

  function svgDataUri(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('folk-fawn-db', 2);
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
      const objectStore = tx.objectStore(store);
      const req = key !== undefined ? objectStore.put(value, key) : objectStore.put(value);
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
      const req = tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
    });
  }

  function uid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `t_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  }

  function sanitizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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

  function fileKey(file) {
    const rel = sanitizeText(file.webkitRelativePath || file.relativePath || '').toLowerCase();
    const name = sanitizeText(file.name || '').toLowerCase();
    return `${rel || name}|${file.size}|${file.lastModified || 0}`;
  }

  function stripExt(name) {
    return String(name).replace(/\.[^.]+$/, '');
  }

  function fallbackCover(letter = '♪') {
    const ch = sanitizeText(letter).charAt(0) || '♪';
    return svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#262c34"/>
            <stop offset="100%" stop-color="#14171c"/>
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="96" fill="url(#g)"/>
        <text x="50%" y="54%" font-size="170" text-anchor="middle" dominant-baseline="middle" fill="#d9b48d" font-family="system-ui, -apple-system, Segoe UI, sans-serif">${escapeHtml(ch)}</text>
      </svg>`);
  }

  function setImage(img, src) {
    img.src = src || DEFAULT_ART;
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const whole = Math.floor(sec);
    const m = Math.floor(whole / 60);
    const s = String(whole % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function prettySortKey(key) {
    return {
      title: 'Title',
      artist: 'Artist',
      album: 'Album',
      year: 'Year Released',
      dateAdded: 'Date Added',
    }[key] || 'Title';
  }

  function normalizeForSort(value) {
    return sanitizeText(value).toLowerCase();
  }

  function normalizeAlbumLabel(value) {
    const label = sanitizeText(value);
    return label && label.toLowerCase() !== 'unknown album' ? label : 'Singles';
  }

  function groupAlbums() {
    const map = new Map();
    for (const track of state.library) {
      const albumName = normalizeAlbumLabel(track.album);
      const albumId = normalizeForSort(albumName) || 'singles';
      if (!map.has(albumId)) {
        map.set(albumId, {
          id: albumId,
          album: albumName,
          artist: track.artist || 'Unknown Artist',
          year: track.year || '',
          dateAdded: track.dateAdded || 0,
          tracks: [],
          covers: [],
          artists: new Set(),
        });
      }
      const album = map.get(albumId);
      album.tracks.push(track);
      album.artists.add(sanitizeText(track.artist || 'Unknown Artist') || 'Unknown Artist');
    }

    for (const album of map.values()) {
      album.tracks.sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0) || (a.title || '').localeCompare(b.title || ''));
      const oldest = [...album.tracks].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      const covers = oldest.filter((t) => t.coverDataUrl).map((t) => t.coverDataUrl);
      if (covers.length) album.covers = covers;
      const years = album.tracks.map((t) => Number(t.year)).filter((n) => Number.isFinite(n) && n > 0);
      if (years.length) album.year = String(Math.min(...years));
      album.dateAdded = Math.min(...album.tracks.map((t) => t.dateAdded || Date.now()));
      const artists = [...album.artists].filter(Boolean);
      album.artist = artists.length > 1 ? 'Various Artists' : (artists[0] || 'Unknown Artist');
      album.artistList = artists;
      delete album.artists;
    }
    return [...map.values()];
  }

  function sortTracks(list) {
    const dir = state.sortDir;
    const key = state.sortKey;
    return [...list].sort((a, b) => {
      const av = key === 'title' ? normalizeForSort(a.title)
        : key === 'artist' ? normalizeForSort(a.artist)
        : key === 'album' ? normalizeForSort(a.album)
        : key === 'year' ? (Number(a.year) || 0)
        : Number(a.dateAdded) || 0;
      const bv = key === 'title' ? normalizeForSort(b.title)
        : key === 'artist' ? normalizeForSort(b.artist)
        : key === 'album' ? normalizeForSort(b.album)
        : key === 'year' ? (Number(b.year) || 0)
        : Number(b.dateAdded) || 0;
      if (typeof av === 'number' || typeof bv === 'number') return (av - bv) * dir;
      return av.localeCompare(bv) * dir;
    });
  }

  function sortAlbums(list) {
    const dir = state.sortDir;
    const key = state.sortKey;
    return [...list].sort((a, b) => {
      const av = key === 'artist' ? normalizeForSort(a.artist)
        : key === 'album' ? normalizeForSort(a.album)
        : key === 'year' ? (Number(a.year) || 0)
        : Number(a.dateAdded) || 0;
      const bv = key === 'artist' ? normalizeForSort(b.artist)
        : key === 'album' ? normalizeForSort(b.album)
        : key === 'year' ? (Number(b.year) || 0)
        : Number(b.dateAdded) || 0;
      if (typeof av === 'number' || typeof bv === 'number') return (av - bv) * dir;
      return av.localeCompare(bv) * dir;
    });
  }

  function findTrack(id) {
    return state.library.find((t) => t.id === id) || null;
  }

  function currentQueueTracks() {
    if (!state.queue.length) return [];
    const start = clamp((state.currentIndex ?? -1) + 1, 0, state.queue.length);
    return state.queue.slice(start).map((id) => findTrack(id)).filter(Boolean);
  }

  function updateSortButtonText() {
    els.sortBtn.textContent = `${prettySortKey(state.sortKey)} ${state.sortDir === 1 ? '▾' : '▴'}`;
  }

  function displayTab(tab) {
    state.activeTab = tab;
    state.view = tab;
    state.albumId = null;
    state.currentQueueMode = tab;

    $$('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-current', btn.dataset.tab === tab ? 'page' : 'false');
    });

    els.songsView.classList.toggle('active', tab === 'songs');
    els.albumsView.classList.toggle('active', tab === 'albums');
    els.searchView.classList.toggle('active', tab === 'search');
    els.albumView.classList.remove('active');
    els.playerView.classList.remove('active');
    els.crumb.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
    els.screenTitle.textContent = tab === 'songs' ? 'Folk Fawn' : tab.charAt(0).toUpperCase() + tab.slice(1);
    els.sortBtn.style.display = (tab === 'songs' || tab === 'albums') ? 'inline-flex' : 'none';
    renderAll();
  }

  function openAlbum(albumId) {
    const album = groupAlbums().find((a) => a.id === albumId);
    if (!album) return;
    state.view = 'album';
    state.albumId = albumId;
    els.songsView.classList.remove('active');
    els.albumsView.classList.remove('active');
    els.searchView.classList.remove('active');
    els.playerView.classList.remove('active');
    els.albumView.classList.add('active');
    els.crumb.textContent = 'Album';
    els.screenTitle.textContent = album.album;
    els.sortBtn.style.display = 'none';
    renderAlbum(album);
  }

  function openPlayer() {
    state.view = 'player';
    els.songsView.classList.remove('active');
    els.albumsView.classList.remove('active');
    els.searchView.classList.remove('active');
    els.albumView.classList.remove('active');
    els.playerView.classList.add('active');
    els.crumb.textContent = 'Now Playing';
    els.screenTitle.textContent = 'Now Playing';
    els.sortBtn.style.display = 'none';
    updatePlayerView();
  }

  function closePlayerToMini() {
    if (!state.currentTrackId) {
      displayTab(state.activeTab || 'songs');
      return;
    }
    state.view = 'mini';
    els.playerView.classList.remove('active');
    els.albumView.classList.remove('active');
    els.songsView.classList.toggle('active', state.activeTab === 'songs');
    els.albumsView.classList.toggle('active', state.activeTab === 'albums');
    els.searchView.classList.toggle('active', state.activeTab === 'search');
    els.miniPlayer.classList.remove('hidden');
    els.sortBtn.style.display = (state.activeTab === 'songs' || state.activeTab === 'albums') ? 'inline-flex' : 'none';
    renderAll();
  }

  function togglePlayerSize() {
    if (state.view === 'player') {
      closePlayerToMini();
      return;
    }
    if (state.currentTrackId) {
      openPlayer();
    }
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
    const covers = album.covers || [];
    if (!covers.length) return fallbackCover(album.album?.[0] || '♪');
    const index = state.albumCoverIndex.get(album.id) || 0;
    return covers[index % covers.length];
  }

  function cycleAlbumCover(albumId) {
    const album = groupAlbums().find((a) => a.id === albumId);
    if (!album || !album.covers?.length) return;
    const next = ((state.albumCoverIndex.get(albumId) || 0) + 1) % album.covers.length;
    state.albumCoverIndex.set(albumId, next);
    els.albumHeroArt.src = albumCoverFor(album);
    toast('Album cover changed for this album view');
  }

  function renderSongs() {
    const items = sortTracks(getFilteredLibrary());
    els.songsCount.textContent = `${items.length} song${items.length === 1 ? '' : 's'} in view`;
    els.songsList.innerHTML = items.map((t) => songRowHTML(t)).join('') || emptyState('No songs found.');
    bindSongRows(els.songsList, items);
  }

  function renderSearchResults() {
    const items = sortTracks(getFilteredLibrary());
    els.searchList.innerHTML = items.map((t) => songRowHTML(t, { showRemove: true })).join('') || emptyState('No matching songs yet.');
    bindSongRows(els.searchList, items, null, { allowRemove: true });
  }

  function renderAlbums() {
    const albums = sortAlbums(groupAlbums());
    els.albumsCount.textContent = `${albums.length} album${albums.length === 1 ? '' : 's'} in library`;
    els.albumsGrid.innerHTML = albums.map((album) => albumCardHTML(album)).join('') || emptyState('No albums found.');
    $$('.album-card', els.albumsGrid).forEach((card) => {
      card.addEventListener('click', () => openAlbum(card.dataset.albumId));
    });
  }

  function renderAlbum(album) {
    const tracks = [...album.tracks].sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0) || (a.title || '').localeCompare(b.title || ''));
    els.albumHeroArt.src = albumCoverFor(album);
    els.albumHeroTitle.textContent = album.album || 'Unknown Album';
    const artistLabel = album.artistList?.length > 1 ? album.artistList.join(' • ') : (album.artist || 'Unknown Artist');
    els.albumHeroMeta.textContent = `${artistLabel} • ${tracks.length} song${tracks.length === 1 ? '' : 's'}`;
    els.albumHeroArt.onclick = () => cycleAlbumCover(album.id);
    els.albumSongsList.innerHTML = tracks.map((t) => songRowHTML(t)).join('') || emptyState('No songs in this album.');
    bindSongRows(els.albumSongsList, tracks, album.id);
  }

  function renderQueue() {
    const q = currentQueueTracks();
    if (!state.currentTrackId || !q.length) {
      els.queueList.innerHTML = emptyState('Queue is empty.');
      return;
    }
    els.queueList.innerHTML = q.map((t, idx) => queueRowHTML(t, idx)).join('');
    $$('.queue-row', els.queueList).forEach((row) => {
      row.draggable = true;
      row.addEventListener('dragstart', onQueueDragStart);
      row.addEventListener('dragover', onQueueDragOver);
      row.addEventListener('drop', onQueueDrop);
      row.addEventListener('dragend', onQueueDragEnd);
      const remove = $('.queue-remove', row);
      const play = $('.queue-play', row);
      if (remove) remove.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromQueue(row.dataset.trackId);
      });
      if (play) play.addEventListener('click', async (e) => {
        e.stopPropagation();
        await playTrackById(row.dataset.trackId);
      });
    });
  }

  function renderMiniPlayer() {
    const track = findTrack(state.currentTrackId);
    if (!track) {
      els.miniPlayer.classList.add('hidden');
      return;
    }
    els.miniPlayer.classList.remove('hidden');
    els.miniArt.src = track.coverDataUrl || fallbackCover(track.title?.[0] || '♪');
    els.miniTitle.textContent = track.title || 'Untitled';
    els.miniArtist.textContent = `${track.artist || 'Unknown Artist'} · ${track.album || 'Unknown Album'}`;
    els.miniPlayBtn.textContent = els.audio.paused ? '▶' : '⏸';
  }

  function updatePlayerView() {
    const track = findTrack(state.currentTrackId);
    if (!track) {
      els.playerTitle.textContent = 'Nothing playing';
      els.playerArtist.textContent = '';
      els.playerAlbum.textContent = '';
      els.playerArt.src = DEFAULT_ART;
      els.miniArt.src = DEFAULT_ART;
      els.miniTitle.textContent = 'Nothing playing';
      els.miniArtist.textContent = '';
      els.lyricsText.textContent = 'No embedded lyrics found.';
      updateLoopButton();
      updateTimeUi();
      return;
    }
    els.playerTitle.textContent = track.title || 'Untitled';
    els.playerArtist.textContent = track.artist || 'Unknown Artist';
    els.playerAlbum.textContent = track.album || 'Unknown Album';
    const cover = track.coverDataUrl || fallbackCover(track.title?.[0] || '♪');
    els.playerArt.src = cover;
    els.miniArt.src = cover;
    els.miniTitle.textContent = track.title || 'Untitled';
    els.miniArtist.textContent = `${track.artist || 'Unknown Artist'} · ${track.album || 'Unknown Album'}`;
    els.lyricsText.textContent = track.lyrics?.trim() || 'No embedded lyrics found.';
    updateLoopButton();
    updateTimeUi();
    renderQueue();
  }

  function updateLoopButton() {
    els.loopAlbumBtn.textContent = state.repeatAlbum ? 'Looping Album' : 'Loop Album';
    els.loopAlbumBtn.classList.toggle('active-button', state.repeatAlbum);
  }

  function updateTimeUi() {
    const duration = els.audio.duration || 0;
    const current = els.audio.currentTime || 0;
    els.timeNow.textContent = formatTime(current);
    els.timeEnd.textContent = formatTime(duration);
    els.seekSlider.value = duration ? Math.round((current / duration) * 1000) : 0;
  }

  function songRowHTML(track, { showRemove = false } = {}) {
    const current = track.id === state.currentTrackId;
    const removeBtn = showRemove ? '<button class="icon-btn queue-remove remove-track" title="Remove song">Remove</button>' : '';
    return `
      <article class="song-row ${current ? 'current' : ''}" data-track-id="${escapeAttr(track.id)}">
        <img class="song-cover" src="${escapeAttr(track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'))}" alt="" />
        <div class="song-meta">
          <div class="song-title">${escapeHtml(track.title || track.fileName || 'Untitled')}</div>
          <div class="song-artist">${escapeHtml(track.artist || 'Unknown Artist')}</div>
        </div>
        <div class="item-actions">
          ${removeBtn}
          <button class="icon-btn queue-add" title="Queue song">＋</button>
          <button class="icon-btn play-song" title="Play song">▶</button>
        </div>
      </article>`;
  }

  function albumCardHTML(album) {
    return `
      <article class="album-card" data-album-id="${escapeAttr(album.id)}">
        <img src="${escapeAttr(albumCoverFor(album))}" alt="${escapeHtml(album.album)}" />
        <div class="album-meta">
          <div class="album-title">${escapeHtml(album.album || 'Unknown Album')}</div>
          <div class="album-sub">${escapeHtml(album.artist || 'Unknown Artist')}</div>
        </div>
      </article>`;
  }

  function queueRowHTML(track, idx) {
    return `
      <article class="queue-row" data-track-id="${escapeAttr(track.id)}">
        <div class="queue-handle" title="Drag to reorder">⋮⋮</div>
        <img class="queue-cover" src="${escapeAttr(track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'))}" alt="" />
        <div class="queue-meta">
          <div class="queue-title">${escapeHtml(track.title || track.fileName || 'Untitled')}</div>
          <div class="queue-sub">${escapeHtml(track.artist || 'Unknown Artist')} · ${escapeHtml(normalizeAlbumLabel(track.album) || 'Singles')}</div>
        </div>
        <div class="item-actions">
          <button class="icon-btn queue-play" title="Play now">▶</button>
          <button class="icon-btn queue-remove" title="Remove">Remove</button>
        </div>
      </article>`;
  }

  function emptyState(text) {
    return `<div class="import-note">${escapeHtml(text)}</div>`;
  }

  function bindSongRows(root, items, albumId = null, { allowRemove = false } = {}) {
    $$('.song-row', root).forEach((row) => {
      const id = row.dataset.trackId;
      const song = items.find((t) => t.id === id) || findTrack(id);
      if (!song) return;

      row.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button?.classList.contains('queue-add') || button?.classList.contains('play-song') || button?.classList.contains('remove-track')) return;
        const queueIds = items.map((t) => t.id);
        const index = queueIds.indexOf(id);
        const hasPlayback = state.currentTrackId && !els.audio.paused;
        if (hasPlayback && state.currentTrackId !== id) {
          queueTrackNext(id, queueIds, albumId ? 'album' : 'songs', albumId);
          toast('Queued next');
          return;
        }
        selectTrack(id, queueIds, index, albumId ? 'album' : 'songs', albumId, { autoplay: true });
      });

      const playBtn = $('.play-song', row);
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const queueIds = items.map((t) => t.id);
          const index = queueIds.indexOf(id);
          if (state.currentTrackId && !els.audio.paused && state.currentTrackId !== id) {
            queueTrackNext(id, queueIds, albumId ? 'album' : 'songs', albumId);
            toast('Queued next');
            return;
          }
          selectTrack(id, queueIds, index, albumId ? 'album' : 'songs', albumId, { autoplay: true });
        });
      }

      const queueBtn = $('.queue-add', row);
      if (queueBtn) {
        queueBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          addToQueueAfterCurrent(id);
        });
      }

      const removeBtn = $('.remove-track', row);
      if (removeBtn && allowRemove) {
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await removeTrackFromLibrary(id);
        });
      }
    });
  }

  function getFilteredLibrary() {
    const query = normalizeForSort(state.searchQuery);
    if (!query) return [...state.library];
    return state.library.filter((track) => {
      const hay = [
        track.title,
        track.artist,
        track.album,
        track.year,
        track.fileName,
      ].map(normalizeForSort).join(' ');
      return hay.includes(query);
    });
  }

  function currentSelectionQueue() {
    return getFilteredLibrary().map((t) => t.id);
  }

  function setQueue(ids, startIndex = 0, mode = 'songs', albumId = null) {
    state.queue = Array.from(ids || []).filter(Boolean);
    state.currentIndex = clamp(startIndex, 0, Math.max(0, state.queue.length - 1));
    state.currentTrackId = state.queue[state.currentIndex] || null;
    state.repeatAlbum = mode === 'album' && !!albumId;
    state.currentAlbumId = albumId || null;
    state.currentQueueMode = mode;
    updateLoopButton();
    updatePlayerView();
    renderAll();
  }

  function selectTrack(id, queueIds = null, index = null, mode = 'songs', albumId = null, { autoplay = true } = {}) {
    const ids = queueIds?.length ? queueIds : state.library.map((t) => t.id);
    const startIndex = index ?? ids.indexOf(id);
    state.queue = ids.filter(Boolean);
    state.currentIndex = clamp(startIndex, 0, Math.max(0, state.queue.length - 1));
    state.currentTrackId = state.queue[state.currentIndex] || id;
    state.currentQueueMode = mode;
    state.repeatAlbum = mode === 'album' && !!albumId;
    state.currentAlbumId = albumId || null;
    updateLoopButton();
    openPlayer();
    renderMiniPlayer();
    renderQueue();
    if (autoplay) {
      startPlayback();
    }
  }

  function queueTrackNext(id, queueIds = null, mode = 'songs', albumId = null) {
    const ids = Array.isArray(queueIds) && queueIds.length ? queueIds : state.library.map((t) => t.id);
    const queue = ids.filter(Boolean);
    const currentId = state.currentTrackId;
    const currentPos = currentId ? state.queue.indexOf(currentId) : -1;
    const existing = state.queue.indexOf(id);
    if (existing !== -1) state.queue.splice(existing, 1);
    const insertAt = currentPos >= 0 ? currentPos + 1 : 0;
    state.queue.splice(insertAt, 0, id);
    if (!currentId) {
      state.currentIndex = 0;
      state.currentTrackId = id;
      state.currentQueueMode = mode;
      state.repeatAlbum = mode === 'album' && !!albumId;
      state.currentAlbumId = albumId || null;
      updateLoopButton();
      selectTrack(id, state.queue, state.queue.indexOf(id), mode, albumId, { autoplay: true });
      return;
    }
    renderQueue();
    renderMiniPlayer();
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
    syncAudioVolume();
    if (audioCtx && audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (err) { console.warn(err); }
    }
    try {
      await els.audio.play();
    } catch (err) {
      console.warn(err);
      toast('Tap play again if playback was blocked');
    }
    updateMasterGain();
    applyEQ();
    renderMiniPlayer();
    updatePlayerView();
    renderQueue();
  }


  async function playTrackById(trackId) {
    if (!trackId) return;
    const idx = state.queue.indexOf(trackId);
    if (idx >= 0) {
      state.currentIndex = idx;
      state.currentTrackId = trackId;
    } else {
      const track = findTrack(trackId);
      if (!track) return;
      state.queue = [trackId];
      state.currentIndex = 0;
      state.currentTrackId = trackId;
      state.currentQueueMode = 'songs';
      state.currentAlbumId = track.albumId || null;
    }
    openPlayer();
    renderMiniPlayer();
    renderQueue();
    await startPlayback();
  }



  async function removeTrackFromLibrary(id) {
    const track = findTrack(id);
    if (!track) return;
    state.library = state.library.filter((t) => t.id !== id);
    state.queue = state.queue.filter((qid) => qid !== id);
    if (state.currentTrackId === id) {
      const next = state.queue[Math.min(state.currentIndex, Math.max(0, state.queue.length - 1))];
      state.currentTrackId = next || null;
      state.currentIndex = state.currentTrackId ? state.queue.indexOf(state.currentTrackId) : -1;
      if (state.currentTrackId) {
        await startPlayback();
      } else {
        els.audio.pause();
        els.audio.removeAttribute('src');
        if (currentObjectUrl) {
          URL.revokeObjectURL(currentObjectUrl);
          currentObjectUrl = null;
        }
        renderMiniPlayer();
      }
    }
    await dbDelete('tracks', id);
    renderAll();
    toast('Song removed');
  }

  async function makeObjectUrl(track) {
    if (!track?.file) return null;
    return URL.createObjectURL(track.file);
  }

  async function ensureAudioGraph() {
    if (state.directAudioMode) return;
    if (state.audioReady) return;
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
    trebleFilter.frequency.value = 5200;

    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;

    mediaSource.connect(gainNode);
    gainNode.connect(compressor);
    compressor.connect(bassFilter);
    bassFilter.connect(midFilter);
    midFilter.connect(trebleFilter);
    trebleFilter.connect(audioCtx.destination);

    state.audioReady = true;
    updateMasterGain();
    applyEQ();
  }

  function syncAudioVolume() {
    const track = findTrack(state.currentTrackId);
    const norm = state.autoNormalize && track?.normGain ? Number(track.normGain) : 1;
    const vol = Number(els.volumeSlider.value) / 100;
    const output = clamp(vol * norm, 0, 0.5);
    if (gainNode) {
      gainNode.gain.value = output;
    } else {
      els.audio.volume = output;
    }
    els.volReadout.textContent = `${Math.round(vol * 200)}%${state.autoNormalize && norm !== 1 ? ` · EQ ${norm.toFixed(2)}×` : ''}`;
    return output;
  }

  function updateMasterGain() {
    const output = syncAudioVolume();
    if (!gainNode) return;
    gainNode.gain.value = output;
  }

  function applyEQ() {
    if (!bassFilter || !midFilter || !trebleFilter) return;
    bassFilter.gain.value = Number(els.bassSlider.value);
    midFilter.gain.value = Number(els.midSlider.value);
    trebleFilter.gain.value = Number(els.trebleSlider.value);
  }

  function loadCurrentTrack() {
    updatePlayerView();
    renderMiniPlayer();
    renderQueue();
  }

  function playSelectedIfNeeded() {
    if (!state.currentTrackId) return;
    if (els.audio.paused || !els.audio.src) {
      startPlayback();
    } else {
      els.audio.play();
    }
  }

  async function togglePlayPause() {
    if (!state.currentTrackId) {
      const ids = sortTracks(getFilteredLibrary()).map((t) => t.id);
      if (!ids.length) {
        toast('No songs to play');
        return;
      }
      setQueue(ids, 0, 'songs');
      await startPlayback();
      openPlayer();
      return;
    }
    if (els.audio.paused) {
      if (!els.audio.src || state.currentTrackId && els.audio.src === '') {
        await startPlayback();
      } else {
        try {
          await els.audio.play();
        } catch {
          await startPlayback();
        }
      }
    } else {
      els.audio.pause();
    }
  }

  function addToQueueAfterCurrent(id) {
    if (!id) return;
    const current = state.currentTrackId;
    const existing = state.queue.indexOf(id);
    if (existing !== -1) state.queue.splice(existing, 1);
    if (!current) {
      state.queue = [id];
      state.currentIndex = 0;
      state.currentTrackId = id;
      renderQueue();
      toast('Added to queue');
      return;
    }
    const insertAt = Math.min(state.currentIndex + 1, state.queue.length);
    state.queue.splice(insertAt, 0, id);
    renderQueue();
    toast('Queued next');
  }

  function removeFromQueue(id) {
    if (!id) return;
    const idx = state.queue.indexOf(id);
    if (idx === -1) return;
    const removedCurrent = id === state.currentTrackId;
    state.queue.splice(idx, 1);
    if (idx < state.currentIndex) state.currentIndex -= 1;
    if (removedCurrent) {
      state.currentTrackId = state.queue[state.currentIndex] || null;
      if (!state.currentTrackId) {
        els.audio.pause();
        els.audio.removeAttribute('src');
        if (currentObjectUrl) {
          URL.revokeObjectURL(currentObjectUrl);
          currentObjectUrl = null;
        }
      }
    }
    renderAll();
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

  async function goNext() {
    if (!state.queue.length) return;
    if (state.currentIndex < state.queue.length - 1) {
      state.currentIndex += 1;
      state.currentTrackId = state.queue[state.currentIndex];
      renderAll();
      await startPlayback();
      return;
    }
    if (state.repeatAlbum && state.currentAlbumId) {
      const album = groupAlbums().find((a) => a.id === state.currentAlbumId);
      if (!album) return;
      const ids = album.tracks.map((t) => t.id);
      setQueue(ids, 0, 'album', state.currentAlbumId);
      renderAll();
      await startPlayback();
      return;
    }
    els.audio.pause();
    renderAll();
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
      renderAll();
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
    node._t = setTimeout(() => node.classList.add('hidden'), 1700);
  }

  async function parseMp3Metadata(file) {
    const buffer = await file.arrayBuffer();
    let parsed = { title: '', artist: '', album: '', year: '', trackNumber: 0, coverDataUrl: '', lyrics: '' };
    try {
      parsed = parseID3(buffer);
    } catch (err) {
      console.warn('ID3 parse failed, falling back to filename metadata', err);
    }
    let duration = 0;
    let normGain = 1;
    if (window.AudioContext || window.webkitAudioContext) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ac.decodeAudioData(buffer.slice(0));
        duration = audioBuffer.duration || 0;
        normGain = computeNormalizationGain(audioBuffer);
        await ac.close?.();
      } catch (err) {
        console.warn('Audio decode failed', err);
      }
    }
    return { ...parsed, duration, normGain };
  }

  function computeNormalizationGain(audioBuffer) {
    try {
      const targetPeak = 0.58;
      let peak = 0;
      let rmsSum = 0;
      let sampleCount = 0;
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
        const data = audioBuffer.getChannelData(ch);
        const step = Math.max(1, Math.floor(data.length / 120000));
        for (let i = 0; i < data.length; i += step) {
          const v = data[i];
          const av = Math.abs(v);
          peak = Math.max(peak, av);
          rmsSum += v * v;
          sampleCount += 1;
        }
      }
      if (!peak || !sampleCount) return 1;
      const rms = Math.sqrt(rmsSum / sampleCount);
      const peakGain = targetPeak / peak;
      const rmsGain = rms > 0 ? 0.18 / rms : 1;
      return clamp(Math.min(peakGain, rmsGain), 0.65, 0.9);
    } catch {
      return 1;
    }
  }

  function syncSafeToInt(b1, b2, b3, b4) {
    return ((b1 & 0x7f) << 21) | ((b2 & 0x7f) << 14) | ((b3 & 0x7f) << 7) | (b4 & 0x7f);
  }

  function decodeTextBytes(bytes, encoding = 3, keepNewlines = false) {
    let text = '';
    if (encoding === 0) text = new TextDecoder('iso-8859-1').decode(bytes);
    else if (encoding === 1) text = decodeUtf16(bytes);
    else if (encoding === 2) text = new TextDecoder('utf-16be').decode(bytes);
    else text = new TextDecoder().decode(bytes);
    text = text.replace(/\u0000+$/, '');
    text = text.replace(/\r\n?/g, '\n');
    if (!keepNewlines) text = text.trim();
    return text;
  }

  function decodeUtf16(bytes) {
    if (bytes.length >= 2) {
      const bom = (bytes[0] << 8) | bytes[1];
      if (bom === 0xfeff) return new TextDecoder('utf-16le').decode(bytes.slice(2)).replace(/\u0000+$/, '');
      if (bom === 0xfffe) return new TextDecoder('utf-16be').decode(bytes.slice(2)).replace(/\u0000+$/, '');
    }
    return new TextDecoder('utf-16le').decode(bytes).replace(/\u0000+$/, '');
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
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
      if (encoding === 0 || encoding === 3) {
        while (i < bytes.length && bytes[i] !== 0) i += 1;
        i += 1;
      } else {
        while (i + 1 < bytes.length && !(bytes[i] === 0 && bytes[i + 1] === 0)) i += 2;
        i += 2;
      }
      const image = bytes.slice(i);
      return `data:${mime || 'image/jpeg'};base64,${bytesToBase64(image)}`;
    } catch {
      return '';
    }
  }
  function decodeApicV22(frame) {
    try {
      const bytes = new Uint8Array(frame);
      const encoding = bytes[0];
      let i = 1;
      const mime = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2]).replace(/ +$/, '') || 'image/jpeg';
      i += 3;
      i += 1; // picture type
      if (encoding === 0 || encoding === 3) {
        while (i < bytes.length && bytes[i] !== 0) i += 1;
        i += 1;
      } else {
        while (i + 1 < bytes.length && !(bytes[i] === 0 && bytes[i + 1] === 0)) i += 2;
        i += 2;
      }
      const image = bytes.slice(i);
      return `data:${mime};base64,${bytesToBase64(image)}`;
    } catch {
      return '';
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
    if (flags & 0x40) offset += 4;
    const end = Math.min(buffer.byteLength, 10 + size);
    const frames = { title: '', artist: '', album: '', year: '', trackNumber: 0 };
    let coverDataUrl = '';
    let lyrics = '';
    const frameLen = version === 2 ? 6 : 10;
    const textFrameIds = new Set(['TIT2', 'TT2', 'TPE1', 'TP1', 'TALB', 'TAL', 'TPE2', 'TP2', 'TRCK', 'TRK', 'TYER', 'TYE', 'TDRC']);

    while (offset + frameLen <= end) {
      const idBytes = new Uint8Array(buffer, offset, version === 2 ? 3 : 4);
      const id = String.fromCharCode(...idBytes);
      if (!/^[A-Z0-9]{3,4}$/.test(id) || id.replace(/ /g, '') === '') break;

      let frameSize = 0;
      let dataStart = offset + frameLen;
      if (version === 2) {
        frameSize = (view.getUint8(offset + 3) << 16) | (view.getUint8(offset + 4) << 8) | view.getUint8(offset + 5);
      } else if (version === 4) {
        frameSize = syncSafeToInt(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
      } else {
        frameSize = view.getUint32(offset + 4, false);
      }
      if (frameSize <= 0) break;
      const dataEnd = dataStart + frameSize;
      const frame = buffer.slice(dataStart, dataEnd);

      if (textFrameIds.has(id)) {
        const bytes = new Uint8Array(frame);
        const encoding = bytes[0];
        const text = decodeTextBytes(bytes.slice(1), encoding);
        if (id === 'TIT2' || id === 'TT2') frames.title = text;
        if (id === 'TPE1' || id === 'TP1') frames.artist = text;
        if (id === 'TALB' || id === 'TAL') frames.album = text;
        if (id === 'TPE2' || id === 'TP2') frames.artist = frames.artist || text;
        if (id === 'TRCK' || id === 'TRK') frames.trackNumber = parseInt(text.split('/')[0], 10) || 0;
        if (id === 'TYER' || id === 'TYE' || id === 'TDRC') frames.year = String(text).slice(0, 4);
      } else if ((id === 'USLT' || id === 'ULT') && !lyrics) {
        const bytes = new Uint8Array(frame);
        const encoding = bytes[0] ?? 3;
        let pos = 1;

        // Most ID3v2 lyrics frames store a 3-byte language code immediately after the encoding byte.
        // Some badly-tagged files store the bytes differently, so only skip when it looks like a language tag.
        if (bytes.length >= 4) {
          const lang = String.fromCharCode(bytes[1], bytes[2], bytes[3]);
          if (/^[A-Za-z]{3}$/.test(lang)) pos = 4;
        }

        const readTerminatedText = () => {
          if (encoding === 0 || encoding === 3) {
            while (pos < bytes.length && bytes[pos] !== 0) pos += 1;
            if (pos < bytes.length) pos += 1;
          } else {
            while (pos + 1 < bytes.length && !(bytes[pos] === 0 && bytes[pos + 1] === 0)) pos += 2;
            if (pos + 1 < bytes.length) pos += 2;
          }
        };

        // Skip the content descriptor, then decode the lyrics payload.
        readTerminatedText();
        let lyricBytes = bytes.slice(pos);
        let decodedLyrics = decodeTextBytes(lyricBytes, encoding, true).replace(/\r\n?/g, '\n');

        // Some editors leak the language code into the decoded string; remove it gently.
        decodedLyrics = decodedLyrics.replace(/^(?:eng|[a-z]{3})\s*[:\-]?\s*/i, '');

        // Keep intentional blank lines, but trim only accidental wrapper whitespace.
        lyrics = decodedLyrics.replace(/^\s+|\s+$/g, '');
      } else if ((id === 'APIC' || id === 'PIC') && !coverDataUrl) {
        const pic = id === 'PIC' ? decodeApicV22(frame) : decodeApic(frame);
        if (pic) coverDataUrl = pic;
      }

      offset = dataEnd;
    }

    return { ...frames, coverDataUrl, lyrics };
  }

  async function scanFile(file) {
    const meta = await parseMp3Metadata(file);
    const albumName = normalizeAlbumLabel(meta.album);
    const albumId = normalizeForSort(albumName) || 'singles';
    return {
      id: uid(),
      file,
      fileKey: fileKey(file),
      fileName: file.name,
      title: meta.title || stripExt(file.name),
      artist: meta.artist || 'Unknown Artist',
      album: albumName,
      year: meta.year || '',
      trackNumber: meta.trackNumber || 0,
      dateAdded: Date.now(),
      coverDataUrl: meta.coverDataUrl || '',
      lyrics: meta.lyrics || '',
      albumId,
      normGain: meta.normGain || 1,
      duration: meta.duration || 0,
    };
  }

  async function importFiles(files, { remember = false } = {}) {
    const list = Array.from(files || []).filter((f) => {
      const lowerName = String(f?.name || '').toLowerCase();
      const lowerRel = String(f?.webkitRelativePath || '').toLowerCase();
      const isAudioType = String(f?.type || '').startsWith('audio/');
      const matchesExt = ['.mp3', '.mpeg', '.mpga'].some((ext) => lowerName.endsWith(ext) || lowerRel.endsWith(ext));
      return matchesExt || isAudioType;
    });
    if (!list.length) {
      toast('No MP3 files found');
      return;
    }
    const existing = new Set(state.library.map((t) => t.fileKey).filter(Boolean));
    const imported = [];
    let skipped = 0;

    for (const file of list) {
      const key = fileKey(file);
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }
      const track = await scanFile(file);
      existing.add(key);
      imported.push(track);
      state.library.push(track);
      await dbSet('tracks', track);
    }

    if (remember) await rememberFolderHint('Files imported from the selected folder.');
    renderAll();
    if (imported.length) toast(`Imported ${imported.length} track${imported.length === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped}` : ''}`);
    else toast(`Nothing new imported${skipped ? ` · skipped ${skipped}` : ''}`);
  }

  async function scanDirectoryHandle(dirHandle) {
    const files = [];
    const seen = new Set();
    async function walk(handle, prefix = '') {
      for await (const [name, entry] of handle.entries()) {
        const lower = String(name || '').toLowerCase();
        const rel = `${prefix}${name}`;
        if (entry.kind === 'file' && (lower.endsWith('.mp3') || lower.endsWith('.mpeg') || lower.endsWith('.mpga'))) {
          const file = await entry.getFile();
          const key = fileKey(file);
          if (!seen.has(key)) {
            seen.add(key);
            files.push(file);
          }
        } else if (entry.kind === 'directory') {
          await walk(entry, `${rel}/`);
        }
      }
    }
    await walk(dirHandle);
    return files;
  }

  async function chooseFolder() {
    if ('showDirectoryPicker' in window) {
      try {
        if (state.folderHandle?.requestPermission) {
          const perm = await state.folderHandle.requestPermission({ mode: 'read' });
          if (perm === 'granted') {
            await rescanSavedFolder();
            return;
          }
        }
        const dir = await window.showDirectoryPicker({ mode: 'read' });
        state.folderHandle = dir;
        await dbSet('prefs', dir, 'musicFolderHandle');
        await rescanSavedFolder();
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.warn(err);
      }
    }
    els.folderInput.click();
  }

  async function rescanSavedFolder() {
    if (!state.folderHandle) {
      toast('Pick a music folder first');
      return;
    }
    const files = await scanDirectoryHandle(state.folderHandle);
    await importFiles(files, { remember: true });
    els.folderNote.textContent = `Loaded ${files.length} file${files.length === 1 ? '' : 's'} from the selected folder.`;
  }

  async function restoreSavedFolder() {
    try {
      const dir = await dbGet('prefs', 'musicFolderHandle');
      if (dir) {
        state.folderHandle = dir;
        els.folderNote.textContent = 'Last selected folder is remembered. Tap “Choose Music Folder” to rescan it.';
      }
    } catch {
      // ignore
    }
  }

  async function loadLibrary() {
    try {
      state.library = await dbGetAll('tracks');
      let changed = false;
      state.library = state.library.map((track) => {
        const album = normalizeAlbumLabel(track.album);
        if (album !== track.album) changed = true;
        return { ...track, album, albumId: normalizeForSort(album) || 'singles' };
      });
      if (changed) {
        for (const track of state.library) await dbSet('tracks', track);
      }
      await restoreSavedFolder();
      if (!state.library.length) {
        els.folderNote.textContent = 'No songs loaded yet. Import MP3 files or choose a folder.';
      }
      renderAll();
    } catch (err) {
      console.error(err);
      els.folderNote.textContent = 'Library could not be loaded.';
    }
  }

  function renderAll() {
    renderSongs();
    renderAlbums();
    renderSearchResults();
    renderMiniPlayer();
    renderQueue();
    updateSortButtonText();
    updateMasterGain();
  }

  function renderQueueIfVisible() {
    if (state.view === 'player') renderQueue();
  }

  async function saveTracks() {
    for (const track of state.library) {
      await dbSet('tracks', track);
    }
  }

  function updateSortState(key) {
    if (state.sortKey === key) state.sortDir *= -1;
    else {
      state.sortKey = key;
      state.sortDir = 1;
    }
    updateSortButtonText();
    renderAll();
  }

  function updateLoopButton() {
    els.loopAlbumBtn.textContent = state.repeatAlbum ? 'Looping Album' : 'Loop Album';
  }

  function openAlbumFromSong(trackId) {
    const track = findTrack(trackId);
    if (!track) return;
    openAlbum(track.albumId || normalizeForSort(track.album) || 'singles');
  }

  function bindEvents() {
    document.addEventListener('click', () => {
      els.sortMenu.classList.add('hidden');
      els.sortBtn.setAttribute('aria-expanded', 'false');
    });

    els.sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.sortMenu.classList.toggle('hidden');
      els.sortBtn.setAttribute('aria-expanded', String(!els.sortMenu.classList.contains('hidden')));
    });

    $$('.sort-menu button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateSortState(btn.dataset.sort);
        els.sortMenu.classList.add('hidden');
        els.sortBtn.setAttribute('aria-expanded', 'false');
      });
    });

    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => displayTab(btn.dataset.tab));
    });

    els.playAllBtn.addEventListener('click', async () => {
      const ids = sortTracks(getFilteredLibrary()).map((t) => t.id);
      if (!ids.length) return toast('No songs to play');
      setQueue(ids, 0, 'songs');
      openPlayer();
      await startPlayback();
    });

    els.shuffleAllBtn.addEventListener('click', async () => {
      const ids = sortTracks(getFilteredLibrary()).map((t) => t.id);
      if (!ids.length) return toast('No songs to shuffle');
      fisherYates(ids);
      setQueue(ids, 0, 'songs');
      openPlayer();
      await startPlayback();
    });

    els.pickFolderBtn.addEventListener('click', chooseFolder);
    els.importFilesBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', async () => {
      await importFiles(els.fileInput.files);
      els.fileInput.value = '';
    });
    els.folderInput.addEventListener('change', async () => {
      await importFiles(els.folderInput.files, { remember: true });
      els.folderInput.value = '';
    });

    els.searchInput.addEventListener('input', () => {
      state.searchQuery = els.searchInput.value;
      renderSearchResults();
      renderSongs();
    });

    els.albumBackBtn.addEventListener('click', () => displayTab('albums'));

    els.playAlbumBtn.addEventListener('click', async () => {
      const album = groupAlbums().find((a) => a.id === state.albumId);
      if (!album) return;
      const ids = [...album.tracks].sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0) || (a.title || '').localeCompare(b.title || '')).map((t) => t.id);
      setQueue(ids, 0, 'album', album.id);
      openPlayer();
      await startPlayback();
    });

    els.shuffleAlbumBtn.addEventListener('click', async () => {
      const album = groupAlbums().find((a) => a.id === state.albumId);
      if (!album) return;
      const ids = album.tracks.map((t) => t.id);
      fisherYates(ids);
      setQueue(ids, 0, 'album', album.id);
      openPlayer();
      await startPlayback();
    });

    els.playerBackBtn.addEventListener('click', closePlayerToMini);
    els.miniExpandBtn.addEventListener('click', togglePlayerSize);

    els.miniPrevBtn.addEventListener('click', goPrev);
    els.miniPlayBtn.addEventListener('click', togglePlayPause);
    els.miniNextBtn.addEventListener('click', goNext);

    els.reshuffleBtn.addEventListener('click', () => shuffleQueue(true));
    els.loopAlbumBtn.addEventListener('click', () => {
      state.repeatAlbum = !state.repeatAlbum;
      updateLoopButton();
      toast(state.repeatAlbum ? 'Album loop enabled' : 'Album loop disabled');
    });

    els.seekSlider.addEventListener('input', () => {
      seekDragging = true;
      const duration = els.audio.duration || 0;
      if (duration) {
        els.audio.currentTime = (Number(els.seekSlider.value) / 1000) * duration;
        updateTimeUi();
      }
    });
    els.seekSlider.addEventListener('change', () => {
      seekDragging = false;
    });

    els.volumeSlider.addEventListener('input', () => {
      updateMasterGain();
    });

    els.bassSlider.addEventListener('input', applyEQ);
    els.midSlider.addEventListener('input', applyEQ);
    els.trebleSlider.addEventListener('input', applyEQ);

    els.audio.addEventListener('timeupdate', () => {
      if (!seekDragging) updateTimeUi();
      renderMiniPlayer();
    });
    els.audio.addEventListener('loadedmetadata', () => updateTimeUi());
    els.audio.addEventListener('ended', () => { goNext(); });
    els.audio.addEventListener('play', () => renderMiniPlayer());
    els.audio.addEventListener('pause', () => renderMiniPlayer());
    els.audio.addEventListener('error', () => toast('Could not play this file'));

    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      if (audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch (err) { console.warn(err); }
      }
      if (state.currentTrackId && els.audio.src && !els.audio.paused) {
        try { await els.audio.play(); } catch (err) { console.warn(err); }
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.sortMenu.classList.contains('hidden')) {
          els.sortMenu.classList.add('hidden');
          els.sortBtn.setAttribute('aria-expanded', 'false');
        } else if (state.view === 'player') {
          closePlayerToMini();
        } else if (state.view === 'album') {
          displayTab(state.activeTab || 'songs');
        }
      }
    });

    bindSwipe();
    els.queueList.addEventListener('dragover', (e) => e.preventDefault());
  }

  function bindSwipe() {
    let startX = 0;
    let startY = 0;
    let active = false;
    const threshold = 60;

    document.addEventListener('touchstart', (e) => {
      if (e.target.closest('.queue-row') || e.target.closest('input') || e.target.closest('button') || e.target.closest('details')) return;
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
      active = true;
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
    queueDraggingId = e.currentTarget.dataset.trackId;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', queueDraggingId);
  }

  function onQueueDragOver(e) {
    e.preventDefault();
    queueDragOverId = e.currentTarget.dataset.trackId;
  }

  function onQueueDrop(e) {
    e.preventDefault();
    const targetId = e.currentTarget.dataset.trackId;
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
    e.currentTarget.classList.remove('dragging');
    queueDraggingId = null;
    queueDragOverId = null;
  }

  function renderLibraryState() {
    if (!state.library.length) {
      setImage(els.albumHeroArt, fallbackCover());
      setImage(els.playerArt, fallbackCover());
      setImage(els.miniArt, fallbackCover());
    }
  }

  function loadFolderHintText() {
    if (state.folderHandle) els.folderNote.textContent = 'Last selected folder is remembered. Tap “Choose Music Folder” to rescan it.';
  }

  function getQueueIdsForCurrentView() {
    if (state.view === 'album' && state.albumId) {
      const album = groupAlbums().find((a) => a.id === state.albumId);
      return album ? album.tracks.map((t) => t.id) : [];
    }
    return sortTracks(getFilteredLibrary()).map((t) => t.id);
  }

  async function hydrateExistingFiles() {
    const existing = new Set(state.library.map((t) => t.fileKey).filter(Boolean));
    return existing;
  }

  async function presetImages() {
    setImage(els.albumHeroArt, fallbackCover());
    setImage(els.playerArt, fallbackCover());
    setImage(els.miniArt, fallbackCover());
  }

  // Init
  els.audio.preload = 'auto';
  els.audio.playsInline = true;
  els.audio.setAttribute('playsinline', '');
  bindEvents();
  displayTab('songs');
  loadLibrary().then(() => {
    if (state.library.length) toast('Library loaded');
    renderAll();
  });
  els.volReadout.textContent = `${els.volumeSlider.value}%`;
  syncAudioVolume();
  updateMasterGain();
  applyEQ();
  updateTimeUi();
  presetImages();
  els.miniPlayer.classList.add('hidden');

  window.selectTrack = selectTrack;
  window.removeFromQueue = removeFromQueue;
})();
