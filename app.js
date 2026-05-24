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
    authorId: null,
    sortKey: 'title',
    sortDir: 1,
    searchQuery: '',
    albumSearchQuery: '',
    authorSearchQuery: '',
    repeatAlbum: false,
    currentAlbumId: null,
    albumCoverIndex: new Map(),
    albumCoverSelection: new Map(),
    folderHandle: null,
    autoNormalize: true,
    audioReady: false,
    currentQueueMode: 'songs',
    directAudioMode: false,
  };
  const ABS_VOLUME_MIN = 0.10;
  const ABS_VOLUME_MAX = 10;
  const ABS_VOLUME_STEP = 0.1;
  const MASTER_VOLUME_CAP = 0.5;

  const els = {
    tabbar: $('#tabbar'),
    tabs: $$('.tab-btn'),
    crumb: $('#crumb'),
    screenTitle: $('#screenTitle'),
    sortBtn: $('#sortBtn'),
    sortMenu: $('#sortMenu'),
    songsView: $('#songsView'),
    albumsView: $('#albumsView'),
    authorsView: $('#authorsView'),
    searchView: $('#searchView'),
    albumView: $('#albumView'),
    authorView: $('#authorView'),
    playerView: $('#playerView'),
    songsList: $('#songsList'),
    albumsGrid: $('#albumsGrid'),
    authorsGrid: $('#authorsGrid'),
    searchList: $('#searchList'),
    albumSongsList: $('#albumSongsList'),
    authorSongsList: $('#authorSongsList'),
    queueList: $('#queueList'),
    songsCount: $('#songsCount'),
    albumsCount: $('#albumsCount'),
    authorsCount: $('#authorsCount'),
    searchInput: $('#searchInput'),
    searchClearBtn: $('#searchClearBtn'),
    albumSearchInput: $('#albumSearchInput'),
    albumClearBtn: $('#albumClearBtn'),
    authorSearchInput: $('#authorSearchInput'),
    authorClearBtn: $('#authorClearBtn'),
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
    authorBackBtn: $('#authorBackBtn'),
    authorHeroArt: $('#authorHeroArt'),
    authorHeroTitle: $('#authorHeroTitle'),
    authorHeroMeta: $('#authorHeroMeta'),
    playAuthorBtn: $('#playAuthorBtn'),
    shuffleAuthorBtn: $('#shuffleAuthorBtn'),
    playerBackBtn: $('#playerBackBtn'),
    miniPlayer: $('#miniPlayer'),
    miniArt: $('#miniArt'),
    miniTitle: $('#miniTitle'),
    miniArtist: $('#miniArtist'),
    miniPrevBtn: $('#miniPrevBtn'),
    miniPlayBtn: $('#miniPlayBtn'),
    miniNextBtn: $('#miniNextBtn'),
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
    absVolumeSlider: $('#absVolumeSlider'),
    absVolumeReadout: $('#absVolumeReadout'),
    bassSlider: $('#bassSlider'),
    midSlider: $('#midSlider'),
    trebleSlider: $('#trebleSlider'),
    lyricsText: $('#lyricsText'),
    audio: $('#audio'),
  };

  const dbPromise = openDB();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  state.directAudioMode = isIOS;
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
  const listObservers = new Map();
  const marqueeElements = new Set();

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

  async function restoreAlbumCoverPrefs() {
    try {
      const saved = await dbGet('prefs', 'albumCoverSelection');
      if (saved && typeof saved === 'object') {
        state.albumCoverSelection = new Map(Object.entries(saved).map(([key, value]) => [key, String(value)]));
      }
    } catch (err) {
      console.warn('Could not restore album cover preferences', err);
    }
  }

  async function saveAlbumCoverPrefs() {
    try {
      await dbSet('prefs', Object.fromEntries(state.albumCoverSelection.entries()), 'albumCoverSelection');
    } catch (err) {
      console.warn('Could not save album cover preferences', err);
    }
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

  const textCollator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base',
    ignorePunctuation: true,
  });

  function normalizeForSort(value) {
    return sanitizeText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function normalizeForIdentity(value) {
    return sanitizeText(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function compareTextValues(a, b, dir = 1) {
    return textCollator.compare(sanitizeText(a), sanitizeText(b)) * dir;
  }

  function normalizeAlbumLabel(value) {
    const label = sanitizeText(value);
    return label && label.toLowerCase() !== 'unknown album' ? label : 'Singles';
  }

  function legacyTrackSignature(track) {
    return [
      normalizeForIdentity(track?.title || track?.fileName || ''),
      normalizeForIdentity(track?.artist || ''),
      normalizeForIdentity(normalizeAlbumLabel(track?.album) || ''),
      String(track?.year || ''),
      String(Number(track?.trackNumber) || 0),
      String(Math.round(Number(track?.duration) || 0)),
    ].join('|');
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
          coverTracks: [],
          artists: new Set(),
        });
      }
      const album = map.get(albumId);
      album.tracks.push(track);
      album.artists.add(sanitizeText(track.artist || 'Unknown Artist') || 'Unknown Artist');
    }

    for (const album of map.values()) {
      album.tracks.sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0) || compareTextValues(a.title, b.title));
      const oldest = [...album.tracks].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      album.coverTracks = oldest.filter((t) => t.coverDataUrl).map((t) => ({ id: t.id, coverDataUrl: t.coverDataUrl }));
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

  function groupAuthors() {
    const map = new Map();
    for (const track of state.library) {
      const artistName = sanitizeText(track.artist) || 'Unknown Artist';
      const artistId = normalizeForSort(artistName) || 'unknown';
      if (!map.has(artistId)) {
        map.set(artistId, {
          id: artistId,
          artist: artistName,
          tracks: [],
          coverTracks: [],
          albums: new Set(),
        });
      }
      const author = map.get(artistId);
      author.tracks.push(track);
      author.albums.add(normalizeAlbumLabel(track.album));
    }

    for (const author of map.values()) {
      author.tracks.sort((a, b) => compareTextValues(a.title, b.title));
      const oldest = [...author.tracks].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      author.coverTracks = oldest.filter((t) => t.coverDataUrl).map((t) => ({ id: t.id, coverDataUrl: t.coverDataUrl }));
      author.albumCount = author.albums.size;
      delete author.albums;
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
      return compareTextValues(av, bv, dir);
    });
  }

  function sortAlbums(list) {
    const dir = state.sortDir;
    const key = state.sortKey;
    return [...list].sort((a, b) => {
      const av = key === 'title' || key === 'album' ? normalizeForSort(a.album)
        : key === 'artist' ? normalizeForSort(a.artist)
        : key === 'year' ? (Number(a.year) || 0)
        : Number(a.dateAdded) || 0;
      const bv = key === 'title' || key === 'album' ? normalizeForSort(b.album)
        : key === 'artist' ? normalizeForSort(b.artist)
        : key === 'year' ? (Number(b.year) || 0)
        : Number(b.dateAdded) || 0;
      if (typeof av === 'number' || typeof bv === 'number') return (av - bv) * dir;
      return compareTextValues(av, bv, dir);
    });
  }

  function sortAuthors(list) {
    const dir = state.sortDir;
    return [...list].sort((a, b) => compareTextValues(normalizeForSort(a.artist), normalizeForSort(b.artist), dir));
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
    state.authorId = null;
    state.currentQueueMode = tab;

    $$('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-current', btn.dataset.tab === tab ? 'page' : 'false');
    });

    els.songsView.classList.toggle('active', tab === 'songs');
    els.albumsView.classList.toggle('active', tab === 'albums');
    if (els.authorsView) els.authorsView.classList.toggle('active', tab === 'authors');
    els.searchView.classList.toggle('active', tab === 'search');
    els.albumView.classList.remove('active');
    if (els.authorView) els.authorView.classList.remove('active');
    els.playerView.classList.remove('active');
    
    els.crumb.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
    els.screenTitle.textContent = tab === 'songs' ? 'Folk Fawn' : tab.charAt(0).toUpperCase() + tab.slice(1);
    els.sortBtn.style.display = (tab === 'songs' || tab === 'albums' || tab === 'authors') ? 'inline-flex' : 'none';
    renderAll();
  }

  function openAlbum(albumId) {
    const album = groupAlbums().find((a) => a.id === albumId);
    if (!album) return;
    state.view = 'album';
    state.albumId = albumId;
    els.songsView.classList.remove('active');
    els.albumsView.classList.remove('active');
    if (els.authorsView) els.authorsView.classList.remove('active');
    els.searchView.classList.remove('active');
    els.playerView.classList.remove('active');
    els.albumView.classList.add('active');
    els.crumb.textContent = 'Album';
    els.screenTitle.textContent = album.album;
    els.sortBtn.style.display = 'none';
    renderAlbum(album);
  }

  function openAuthor(authorId) {
    const author = groupAuthors().find((a) => a.id === authorId);
    if (!author) return;
    state.view = 'author';
    state.authorId = authorId;
    els.songsView.classList.remove('active');
    els.albumsView.classList.remove('active');
    if (els.authorsView) els.authorsView.classList.remove('active');
    els.searchView.classList.remove('active');
    els.playerView.classList.remove('active');
    els.albumView.classList.remove('active');
    if (els.authorView) els.authorView.classList.add('active');
    els.crumb.textContent = 'Artist';
    els.screenTitle.textContent = author.artist;
    els.sortBtn.style.display = 'none';
    renderAuthor(author);
  }

  function openPlayer() {
    state.view = 'player';
    els.songsView.classList.remove('active');
    els.albumsView.classList.remove('active');
    if (els.authorsView) els.authorsView.classList.remove('active');
    els.searchView.classList.remove('active');
    els.albumView.classList.remove('active');
    if (els.authorView) els.authorView.classList.remove('active');
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
    if (els.authorView) els.authorView.classList.remove('active');
    els.songsView.classList.toggle('active', state.activeTab === 'songs');
    els.albumsView.classList.toggle('active', state.activeTab === 'albums');
    if (els.authorsView) els.authorsView.classList.toggle('active', state.activeTab === 'authors');
    els.searchView.classList.toggle('active', state.activeTab === 'search');
    els.miniPlayer.classList.remove('hidden');
    els.sortBtn.style.display = (state.activeTab === 'songs' || state.activeTab === 'albums' || state.activeTab === 'authors') ? 'inline-flex' : 'none';
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
    if (state.view === 'album' || state.view === 'author') {
      displayTab(state.activeTab || 'songs');
    }
  }

  function albumCoverFor(album) {
    const covers = album.coverTracks || [];
    if (!covers.length) return fallbackCover(album.album?.[0] || album.artist?.[0] || '♪');
    const selectedId = state.albumCoverSelection.get(album.id);
    if (selectedId) {
      const selected = covers.find((c) => c.id === selectedId);
      if (selected?.coverDataUrl) return selected.coverDataUrl;
    }
    return covers[0]?.coverDataUrl || fallbackCover(album.album?.[0] || album.artist?.[0] || '♪');
  }

  async function cycleAlbumCover(albumId) {
    const album = groupAlbums().find((a) => a.id === albumId);
    const covers = album?.coverTracks || [];
    if (!album || !covers.length) return;
    const currentId = state.albumCoverSelection.get(albumId);
    const currentIndex = Math.max(0, covers.findIndex((c) => c.id === currentId));
    const next = covers[(currentIndex + 1) % covers.length];
    if (!next) return;
    state.albumCoverSelection.set(albumId, next.id);
    els.albumHeroArt.src = albumCoverFor(album);
    await saveAlbumCoverPrefs();
    renderAlbums();
    renderAll();
    toast('Cover art changed for this view');
  }

  function checkMarquees() {
    marqueeElements.forEach((el) => {
      if (!document.body.contains(el)) {
        marqueeElements.delete(el);
        return;
      }
      el.style.animation = 'none';
      el.style.transform = 'translateX(0)';
      void el.offsetHeight;
      const diff = el.scrollWidth - el.clientWidth;
      if (diff > 2) {
        el.style.setProperty('--m-dist', `-${diff}px`);
        el.style.animation = `marquee-yoyo ${2.5 + diff * 0.03}s linear infinite alternate`;
      }
    });
  }

  window.addEventListener('resize', checkMarquees);

  function registerMarquee(el) {
    if (!el) return;
    el.classList.add('marquee-text');
    marqueeElements.add(el);
    setTimeout(checkMarquees, 10);
  }

  function renderLazyList(container, items, renderHtmlFn, bindNodesFn, emptyText) {
    if (!container) return;
    if (listObservers.has(container)) {
      listObservers.get(container).disconnect();
      listObservers.delete(container);
    }
    container.innerHTML = '';
    if (!items || !items.length) {
      container.innerHTML = emptyState(emptyText);
      return;
    }

    const sentinel = document.createElement('div');
    sentinel.className = 'sentinel';
    sentinel.style.height = '1px';
    container.appendChild(sentinel);

    let currentIndex = 0;
    const chunkSize = 30;

    function loadMore() {
      const chunk = items.slice(currentIndex, currentIndex + chunkSize);
      if (!chunk.length) return;

      const temp = document.createElement('div');
      temp.innerHTML = chunk.map(renderHtmlFn).join('');
      const nodes = Array.from(temp.children);

      nodes.forEach(node => container.insertBefore(node, sentinel));
      if (bindNodesFn) bindNodesFn(nodes);

      currentIndex += chunkSize;

      if (currentIndex >= items.length) {
        if (listObservers.has(container)) {
          listObservers.get(container).disconnect();
          listObservers.delete(container);
        }
        sentinel.remove();
      }
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '400px' });

    observer.observe(sentinel);
    listObservers.set(container, observer);
    loadMore(); 
  }

  function renderSongs() {
    const items = sortTracks(state.library);
    els.songsCount.textContent = `${items.length} song${items.length === 1 ? '' : 's'} in library`;
    renderLazyList(
      els.songsList,
      items,
      (t) => songRowHTML(t),
      (nodes) => bindSongRows(nodes, items),
      'No songs found.'
    );
  }

  function renderSearchResults() {
    const items = sortTracks(getFilteredLibrary());
    renderLazyList(
      els.searchList,
      items,
      (t) => songRowHTML(t, { showRemove: true }),
      (nodes) => bindSongRows(nodes, items, null, { allowRemove: true }),
      'No matching songs yet.'
    );
  }

  function renderAlbums() {
    const albums = sortAlbums(getFilteredAlbums());
    els.albumsCount.textContent = `${albums.length} album${albums.length === 1 ? '' : 's'} in view`;
    renderLazyList(
      els.albumsGrid,
      albums,
      (album) => albumCardHTML(album),
      (nodes) => {
        nodes.forEach((card) => {
          card.addEventListener('click', () => openAlbum(card.dataset.albumId));
          refreshScrollingTexts(card);
        });
      },
      'No albums found.'
    );
  }

  function renderAuthors() {
    if (!els.authorsGrid) return;
    const authors = sortAuthors(getFilteredAuthors());
    els.authorsCount.textContent = `${authors.length} artist${authors.length === 1 ? '' : 's'} in view`;
    renderLazyList(
      els.authorsGrid,
      authors,
      (author) => albumCardHTML(author, true),
      (nodes) => {
        nodes.forEach((card) => {
          card.addEventListener('click', () => openAuthor(card.dataset.albumId));
          refreshScrollingTexts(card);
        });
      },
      'No artists found.'
    );
  }

  function renderAlbum(album) {
    const tracks = [...album.tracks].sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0) || compareTextValues(a.title, b.title));
    els.albumHeroArt.src = albumCoverFor(album);
    els.albumHeroTitle.textContent = album.album || 'Unknown Album';
    const artistLabel = album.artistList?.length > 1 ? album.artistList.join(' • ') : (album.artist || 'Unknown Artist');
    els.albumHeroMeta.textContent = `${artistLabel} • ${tracks.length} song${tracks.length === 1 ? '' : 's'}`;
    els.albumHeroArt.onclick = () => { cycleAlbumCover(album.id); };

    renderLazyList(
      els.albumSongsList,
      tracks,
      (t) => songRowHTML(t),
      (nodes) => bindSongRows(nodes, tracks, album.id),
      'No songs in this album.'
    );
  }

  function renderAuthor(author) {
    if (!els.authorHeroArt) return;
    const tracks = [...author.tracks].sort((a, b) => compareTextValues(a.title, b.title));
    els.authorHeroArt.src = albumCoverFor(author); 
    els.authorHeroTitle.textContent = author.artist || 'Unknown Artist';
    els.authorHeroMeta.textContent = `${author.albumCount} album${author.albumCount === 1 ? '' : 's'} • ${tracks.length} song${tracks.length === 1 ? '' : 's'}`;
    
    renderLazyList(
      els.authorSongsList,
      tracks,
      (t) => songRowHTML(t),
      (nodes) => bindSongRows(nodes, tracks, author.id),
      'No songs found for this artist.'
    );
  }

  function renderQueue() {
    const q = currentQueueTracks();
    if (!state.currentTrackId || !q.length) {
      els.queueList.innerHTML = emptyState('Queue is empty.');
      return;
    }
    
    renderLazyList(
      els.queueList, 
      q, 
      (t, idx) => queueRowHTML(t, idx), 
      (nodes) => {
        nodes.forEach((row) => {
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
          if (play) play.addEventListener('click', (e) => {
            e.stopPropagation();
            playTrackById(row.dataset.trackId);
          });
        });
      }, 
      'Queue is empty.'
    );
  }

  function renderMiniPlayer() {
    const track = findTrack(state.currentTrackId);
    if (!track) {
      els.miniPlayer.classList.add('hidden');
      return;
    }
    els.miniPlayer.classList.remove('hidden');
    els.miniArt.src = track.coverDataUrl || fallbackCover(track.title?.[0] || '♪');
    
    applyScrollingText(els.miniTitle, track.title || 'Untitled', { measure: true });
    applyScrollingText(els.miniArtist, `${track.artist || 'Unknown Artist'} · ${track.album || 'Unknown Album'}`, { measure: true });
    
    els.miniPlayBtn.textContent = els.audio.paused ? '▶' : '=';
    els.miniPlayBtn.classList.toggle('paused-glyph', !els.audio.paused);
  }

  function updatePlayerView() {
    const track = findTrack(state.currentTrackId);
    if (!track) {
      els.playerTitle.textContent = 'Nothing playing';
      els.playerArtist.textContent = '';
      els.playerAlbum.textContent = '';
      els.playerArt.src = DEFAULT_ART;
      els.miniArt.src = DEFAULT_ART;
      applyScrollingText(els.miniTitle, 'Nothing playing', { measure: true });
      applyScrollingText(els.miniArtist, '', { measure: true });
      els.lyricsText.textContent = 'No embedded lyrics found.';
      updateSongVolumeControls(null);
      updateLoopButton();
      updateTimeUi();
      updateMediaSession(null);
      return;
    }
    els.playerTitle.textContent = track.title || 'Untitled';
    els.playerArtist.textContent = track.artist || 'Unknown Artist';
    els.playerAlbum.textContent = track.album || 'Unknown Album';
    const cover = track.coverDataUrl || fallbackCover(track.title?.[0] || '♪');
    els.playerArt.src = cover;
    els.miniArt.src = cover;
    
    applyScrollingText(els.miniTitle, track.title || 'Untitled', { measure: true });
    applyScrollingText(els.miniArtist, `${track.artist || 'Unknown Artist'} · ${track.album || 'Unknown Album'}`, { measure: true });

    els.lyricsText.textContent = track.lyrics?.trim() || 'No embedded lyrics found.';
    
    updateSongVolumeControls(track); 
    updateLoopButton();
    updateTimeUi();
    renderQueue();
  }

  function updateLoopButton() {
    els.loopAlbumBtn.textContent = state.repeatAlbum ? 'Looping' : 'Loop';
    els.loopAlbumBtn.classList.toggle('selected', state.repeatAlbum);
  }

  function updateTimeUi() {
    const duration = els.audio.duration || 0;
    const current = els.audio.currentTime || 0;
    els.timeNow.textContent = formatTime(current);
    els.timeEnd.textContent = formatTime(duration);
    els.seekSlider.value = duration ? Math.round((current / duration) * 1000) : 0;
  }

  function updateMediaSessionPosition() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const duration = els.audio.duration || 0;
    const playbackRate = els.audio.playbackRate || 1;
    const position = els.audio.currentTime || 0;
    if (duration > 0 && position >= 0 && position <= duration) {
      try {
        navigator.mediaSession.setPositionState({ duration, playbackRate, position });
      } catch (e) { /* ignore */ }
    }
  }

  function songRowHTML(track, { showRemove = false } = {}) {
    const current = track.id === state.currentTrackId;
    const removeBtn = showRemove ? '<button class="icon-btn queue-remove remove-track" title="Skip song">–</button>' : '';
    return `
      <article class="song-row ${current ? 'current' : ''}" data-track-id="${escapeAttr(track.id)}">
        <img class="song-cover" loading="lazy" src="${escapeAttr(track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'))}" alt="" />
        <div class="song-meta">
          <div class="song-title">${escapeHtml(track.title || track.fileName || 'Untitled')}</div>
          <div class="song-artist">${escapeHtml(track.artist || 'Unknown Artist')}</div>
        </div>
        <div class="item-actions">
          ${removeBtn}
          <button class="icon-btn queue-add" title="Play or Queue next">＋</button>
        </div>
      </article>`;
  }

  function albumCardHTML(data, isAuthor = false) {
    const title = isAuthor ? data.artist : data.album || 'Unknown Album';
    const sub = isAuthor ? `${data.albumCount} album${data.albumCount === 1 ? '' : 's'}` : data.artist || 'Unknown Artist';
    return `
      <article class="album-card" data-album-id="${escapeAttr(data.id)}">
        <img loading="lazy" src="${escapeAttr(albumCoverFor(data))}" alt="${escapeHtml(title)}" />
        <div class="album-meta">
          <div class="album-title scrolling-text-source" data-scroll-text="${escapeAttr(title)}">${escapeHtml(title)}</div>
          <div class="album-sub scrolling-text-source" data-scroll-text="${escapeAttr(sub)}">${escapeHtml(sub)}</div>
        </div>
      </article>`;
  }

  function queueRowHTML(track, idx) {
    return `
      <article class="queue-row" data-track-id="${escapeAttr(track.id)}">
        <div class="queue-handle" title="Drag to reorder">⋮⋮</div>
        <img class="queue-cover" loading="lazy" src="${escapeAttr(track.coverDataUrl || fallbackCover(track.title?.[0] || '♪'))}" alt="" />
        <div class="queue-meta">
          <div class="queue-title">${escapeHtml(track.title || track.fileName || 'Untitled')}</div>
          <div class="queue-sub">${escapeHtml(track.artist || 'Unknown Artist')} · ${escapeHtml(normalizeAlbumLabel(track.album) || 'Singles')}</div>
        </div>
        <div class="item-actions">
          <button class="icon-btn queue-play" title="Play now">▶</button>
          <button class="icon-btn queue-remove" title="Skip from queue">–</button>
        </div>
      </article>`;
  }

  function emptyState(text) {
    return `<div class="import-note">${escapeHtml(text)}</div>`;
  }

  function applyScrollingText(el, text, { measure = true } = {}) {
    if (!el) return;
    const value = sanitizeText(text);
    el.dataset.scrollText = value;
    el.classList.add('scrolling-text-source');

    const paintStatic = () => {
      el.classList.remove('scrolling-text--active');
      el.innerHTML = escapeHtml(value || '');
    };

    if (!value || !measure) {
      paintStatic();
      return;
    }

    paintStatic();
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const overflow = el.scrollWidth > el.clientWidth + 1;
      if (!overflow) {
        el.classList.remove('scrolling-text--active');
        el.innerHTML = escapeHtml(value);
        return;
      }

      el.classList.add('scrolling-text--active');
      el.innerHTML = `
        <span class="scrolling-text__track" aria-label="${escapeAttr(value)}">
          <span class="scrolling-text__item">${escapeHtml(value)}</span>
          <span class="scrolling-text__item" aria-hidden="true">${escapeHtml(value)}</span>
        </span>`.trim();

      const track = $('.scrolling-text__track', el);
      const item = $('.scrolling-text__item', el);
      if (track && item) {
        const distance = item.getBoundingClientRect().width || item.scrollWidth || 0;
        const duration = Math.max(8, distance / 24);
        track.style.setProperty('--scroll-duration', `${duration}s`);
      }
    });
  }

  function refreshScrollingTexts(root = document) {
    $$('.scrolling-text-source', root).forEach((el) => {
      const text = el.dataset.scrollText != null ? el.dataset.scrollText : el.textContent;
      applyScrollingText(el, text, { measure: true });
    });
  }

  function bindSongRows(nodes, items, albumId = null, { allowRemove = false } = {}) {
    nodes.forEach((row) => {
      const id = row.dataset.trackId;
      const song = items.find((t) => t.id === id) || findTrack(id);
      if (!song) return;

      row.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button?.classList.contains('queue-add') || button?.classList.contains('remove-track')) return;
        const queueIds = items.map((t) => t.id);
        const index = queueIds.indexOf(id);
        const hasPlayback = state.currentTrackId && !els.audio.paused;

        if (hasPlayback) {
          queueTrackNext(id, queueIds, albumId ? 'album' : 'songs', albumId);
          toast('Queued next');
          return;
        }

        selectTrack(id, queueIds, index, albumId ? 'album' : 'songs', albumId, { autoplay: true });
      });

      const queueBtn = $('.queue-add', row);
      if (queueBtn) {
        queueBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const queueIds = items.map((t) => t.id);
          const index = queueIds.indexOf(id);
          if (state.currentTrackId && !els.audio.paused) {
            queueTrackNext(id, queueIds, albumId ? 'album' : 'songs', albumId);
            toast('Queued next');
            return;
          }
          selectTrack(id, queueIds, index, albumId ? 'album' : 'songs', albumId, { autoplay: true });
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

  function getFilteredAlbums() {
    const query = normalizeForSort(state.albumSearchQuery);
    const albums = groupAlbums();
    if (!query) return albums;
    return albums.filter((album) => {
      const hay = [
        album.album,
        album.artist,
        album.year,
        ...(album.artistList || []),
        ...(album.tracks || []).map((t) => t.title),
      ].map(normalizeForSort).join(' ');
      return hay.includes(query);
    });
  }

  function getFilteredAuthors() {
    const query = normalizeForSort(state.authorSearchQuery);
    const authors = groupAuthors();
    if (!query) return authors;
    return authors.filter((author) => {
      return normalizeForSort(author.artist).includes(query);
    });
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

  // NOTE: iOS Background Freeze Bypass applied here
  function startPlayback() {
    const track = findTrack(state.currentTrackId);
    if (!track) return;

    if (currentObjectUrl) {
      // Delay revoking the old URL. If we do it instantly, iOS memory 
      // management can stutter the thread and expire the gesture token.
      const urlToRevoke = currentObjectUrl;
      setTimeout(() => URL.revokeObjectURL(urlToRevoke), 2000);
    }
    
    currentObjectUrl = URL.createObjectURL(track.file);
    els.audio.src = currentObjectUrl;
    els.audio.currentTime = 0;
    syncAudioVolume();

    // SYNCHRONOUS PLAY
    const playPromise = els.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn(err);
        toast('Tap play again if playback was blocked');
      });
    }

    if (!state.directAudioMode) {
      ensureAudioGraph().then(() => {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        updateMasterGain();
        applyEQ();
      });
    }

    updateMediaSession(track);
    renderMiniPlayer();
    updatePlayerView();
    renderQueue();
    updateMediaSessionPosition();
  }

  function playTrackById(trackId) {
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
    startPlayback();
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
        startPlayback();
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

  async function ensureAudioGraph() {
    if (state.directAudioMode) {
      state.audioReady = false;
      return;
    }
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
    const songVol = clamp(Number(track?.absVolume) || 1, ABS_VOLUME_MIN, ABS_VOLUME_MAX);
    const vol = Number(els.volumeSlider.value) / 100;
    const output = clamp(vol * norm * songVol, 0, MASTER_VOLUME_CAP);

    if (state.directAudioMode || !gainNode) {
      els.audio.volume = output;
    } else {
      gainNode.gain.value = output;
    }

    els.volReadout.textContent = `${Math.round(Number(els.volumeSlider.value))}%${(state.autoNormalize && norm !== 1 && !state.directAudioMode) ? ` · EQ ${norm.toFixed(2)}×` : ''}`;
    if (els.absVolumeReadout) {
      els.absVolumeReadout.textContent = `${songVol.toFixed(1)}×`;
    }
    return output;
  }

  function updateMasterGain() {
    const output = syncAudioVolume();
    if (!gainNode || state.directAudioMode) return;
    gainNode.gain.value = output;
  }

  function applyEQ() {
    if (state.directAudioMode || !bassFilter || !midFilter || !trebleFilter) return;
    bassFilter.gain.value = Number(els.bassSlider.value);
    midFilter.gain.value = Number(els.midSlider.value);
    trebleFilter.gain.value = Number(els.trebleSlider.value);
  }

  function togglePlayPause() {
    if (!state.currentTrackId) {
      const ids = sortTracks(state.library).map((t) => t.id);
      if (!ids.length) {
        toast('No songs to play');
        return;
      }
      setQueue(ids, 0, 'songs');
      startPlayback();
      openPlayer();
      return;
    }
    
    if (els.audio.paused) {
      if (!els.audio.src || els.audio.src === '') {
        startPlayback();
      } else {
        // SYNCHRONOUS PLAY: No 'await' allowed here! iOS will block it.
        const playPromise = els.audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('Playback failed:', err);
            startPlayback();
          });
        }
        // Resume the audio graph in the background safely after play is triggered
        resumePlaybackOutput().catch(console.warn);
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

  function goNext() {
    if (!state.queue.length) return;

    const finishedIndex = clamp(state.currentIndex, 0, Math.max(0, state.queue.length - 1));
    const nextIndex = finishedIndex + 1;
    const nextTrackId = state.queue[nextIndex];

    if (nextTrackId) {
      state.queue.splice(finishedIndex, 1);
      state.currentIndex = Math.min(finishedIndex, state.queue.length - 1);
      state.currentTrackId = state.queue[state.currentIndex] || nextTrackId;
      renderAll();
      startPlayback();
      return;
    }

    if (state.repeatAlbum && state.currentAlbumId) {
      const album = groupAlbums().find((a) => a.id === state.currentAlbumId);
      if (!album) return;
      const ids = album.tracks.map((t) => t.id);
      setQueue(ids, 0, 'album', state.currentAlbumId);
      renderAll();
      startPlayback();
      return;
    }

    els.audio.pause();
    state.currentTrackId = null;
    state.currentIndex = -1;
    renderAll();
  }

  function goPrev() {
    if (!state.queue.length) return;
    if (els.audio.currentTime > 3) {
      els.audio.currentTime = 0;
      return;
    }
    if (state.currentIndex > 0) {
      state.currentIndex -= 1;
      state.currentTrackId = state.queue[state.currentIndex];
      renderAll();
      startPlayback();
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

  async function parseMp3Metadata(file, buffer = null) {
    const sourceBuffer = buffer || await file.arrayBuffer();
    const fallback = fallbackMetadataFromFile(file);
    let parsed = {
      title: fallback.title,
      artist: fallback.artist,
      album: fallback.album,
      year: '',
      trackNumber: 0,
      coverDataUrl: '',
      lyrics: '',
    };

    try {
      const id3 = parseID3(sourceBuffer);
      if (id3 && typeof id3 === 'object') parsed = { ...parsed, ...id3 };
    } catch (err) {
      console.warn('ID3 parse failed, falling back to filename metadata', err);
    }

    parsed.title = sanitizeText(parsed.title) || fallback.title || stripExt(file.name) || 'Untitled';
    parsed.artist = sanitizeText(parsed.artist) || fallback.artist || 'Unknown Artist';
    parsed.album = normalizeAlbumLabel(parsed.album || fallback.album || 'Singles');
    parsed.year = sanitizeText(parsed.year) || '';
    parsed.trackNumber = Number(parsed.trackNumber) || 0;
    parsed.coverDataUrl = sanitizeText(parsed.coverDataUrl) || '';
    parsed.lyrics = sanitizeText(parsed.lyrics) || '';

    let duration = 0;
    let normGain = 1;
    if (window.AudioContext || window.webkitAudioContext) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ac.decodeAudioData(sourceBuffer.slice(0));
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
    try {
      if (encoding === 0) text = new TextDecoder('windows-1252').decode(bytes);
      else if (encoding === 1) {
        if (bytes.length >= 2) {
          const bom = (bytes[0] << 8) | bytes[1];
          if (bom === 0xfeff || bom === 0xfffe) {
            text = new TextDecoder('utf-16').decode(bytes);
          } else {
            text = new TextDecoder('utf-16le').decode(bytes);
          }
        } else {
          text = new TextDecoder('utf-16le').decode(bytes);
        }
      }
      else if (encoding === 2) text = new TextDecoder('utf-16be').decode(bytes);
      else text = new TextDecoder('utf-8').decode(bytes);
    } catch {
      text = new TextDecoder('utf-8').decode(bytes);
    }
    text = text.replace(/\u0000+$/, '');
    text = text.replace(/\r\n?/g, '\n');
    return keepNewlines ? text : text.trim();
  }

  function fallbackMetadataFromFile(file) {
    const relative = sanitizeText(file?.webkitRelativePath || '');
    const fileName = stripExt(sanitizeText(file?.name || ''));
    const parts = relative ? relative.split(/[\\/]/).map(sanitizeText).filter(Boolean) : [];
    const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
    const grandParent = parts.length >= 3 ? parts[parts.length - 3] : '';
    let title = fileName || 'Untitled';
    let artist = 'Unknown Artist';
    let album = grandParent || parent || 'Singles';

    const dashMatch = title.match(/^(.+?)\s*[\-–—]\s*(.+)$/);
    if (dashMatch) {
      artist = sanitizeText(dashMatch[1]) || artist;
      title = sanitizeText(dashMatch[2]) || title;
    }

    const nameParts = fileName.split(/\s+[\-–—]\s+/).map(sanitizeText).filter(Boolean);
    if (nameParts.length >= 2 && artist === 'Unknown Artist') {
      artist = nameParts[0];
      title = nameParts.slice(1).join(' - ');
    }

    if (parent && album === 'Singles') album = parent;
    return {
      title,
      artist,
      album: normalizeAlbumLabel(album),
    };
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function bytesToHex(bytes) {
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function sha1Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-1', buffer);
    return bytesToHex(digest);
  }

  async function computeTrackDedupKey(track, fileBuffer = null) {
    const hash = fileBuffer ? await sha1Hex(fileBuffer) : '';
    return [hash, legacyTrackSignature(track)].filter(Boolean).join('|');
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
      const mime = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2]).replace(/ +$/, '') || 'image/jpeg';
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
    const lyricFrames = [];
    const frameLen = version === 2 ? 6 : 10;
    const textFrameIds = new Set(['TIT2', 'TT2', 'TPE1', 'TP1', 'TALB', 'TAL', 'TPE2', 'TP2', 'TRCK', 'TRK', 'TYER', 'TYE', 'TDRC']);

    while (offset + frameLen <= end) {
      const idBytes = new Uint8Array(buffer, offset, version === 2 ? 3 : 4);
      const id = String.fromCharCode(...idBytes);
      if (!/^[A-Z0-9]{3,4}$/.test(id) || id.replace(/ /g, '') === '') break;

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
      } else if ((id === 'USLT' || id === 'ULT')) {
        const bytes = new Uint8Array(frame);
        const encoding = bytes[0] ?? 3;
        let pos = 1;

        let lang = '';
        if (bytes.length >= 4) {
          const maybeLang = String.fromCharCode(bytes[1], bytes[2], bytes[3]).toLowerCase();
          if (/^[a-z]{3}$/.test(maybeLang)) {
            lang = maybeLang;
            pos = 4;
          }
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

        readTerminatedText();
        const lyricBytes = bytes.slice(pos);
        let decodedLyrics = decodeTextBytes(lyricBytes, encoding, true);

        decodedLyrics = decodedLyrics.replace(/\r\n?/g, '\n').trim();
        if (decodedLyrics) lyricFrames.push({ lang, text: decodedLyrics });
      } else if ((id === 'APIC' || id === 'PIC') && !coverDataUrl) {
        const pic = id === 'PIC' ? decodeApicV22(frame) : decodeApic(frame);
        if (pic) coverDataUrl = pic;
      }

      offset = dataEnd;
    }

    const englishLyrics = lyricFrames.find((frame) => frame.lang === 'eng')?.text;
    lyrics = englishLyrics || lyricFrames[0]?.text || '';

    return { ...frames, coverDataUrl, lyrics };
  }

  async function scanFile(file) {
    const buffer = await file.arrayBuffer();
    const meta = await parseMp3Metadata(file, buffer);
    const albumName = normalizeAlbumLabel(meta.album);
    const albumId = normalizeForSort(albumName) || 'singles';
    const track = {
      id: uid(),
      file,
      fileKey: fileKey(file),
      fileName: file.name,
      title: meta.title || stripExt(file.name) || 'Untitled',
      artist: meta.artist || 'Unknown Artist',
      album: albumName,
      year: meta.year || '',
      trackNumber: meta.trackNumber || 0,
      dateAdded: Date.now(),
      coverDataUrl: meta.coverDataUrl || '',
      lyrics: meta.lyrics || '',
      albumId,
      normGain: meta.normGain || 1,
      absVolume: 1,
      duration: meta.duration || 0,
    };

    try {
      track.dedupeKey = await computeTrackDedupKey(track, buffer);
    } catch (err) {
      console.warn('Track hash failed, using filename signature', err);
      track.dedupeKey = legacyTrackSignature(track);
    }

    return track;
  }

  async function importFiles(files, { remember = false } = {}) {
    const list = Array.from(files || []).filter((f) => {
      const lowerName = String(f?.name || '').toLowerCase();
      const lowerRel = String(f?.webkitRelativePath || '').toLowerCase();
      const isAudioType = String(f?.type || '').startsWith('audio/');
      const matchesExt = ['.mp3', '.mpeg', '.mpga', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.webm', '.mp4'].some((ext) => lowerName.endsWith(ext) || lowerRel.endsWith(ext));
      return matchesExt || isAudioType;
    });
    if (!list.length) {
      toast('No audio files found');
      return;
    }
    const existing = new Set(state.library.flatMap((t) => [t.dedupeKey, t.fileKey, legacyTrackSignature(t)].filter(Boolean)));
    const imported = [];
    let skipped = 0;
    let failed = 0;

    for (const file of list) {
      try {
        const track = await scanFile(file);
        const keys = [track.dedupeKey, track.fileKey, legacyTrackSignature(track)].filter(Boolean);
        if (keys.some((key) => existing.has(key))) {
          skipped += 1;
          continue;
        }
        keys.forEach((key) => existing.add(key));
        imported.push(track);
        state.library.push(track);
        try {
          await dbSet('tracks', track);
        } catch (storageErr) {
          console.warn('Track added in memory but could not be saved yet', storageErr);
        }
      } catch (err) {
        failed += 1;
        console.warn('Could not import file', file?.name, err);
        try {
          const fallback = fallbackMetadataFromFile(file);
          const track = {
            id: uid(),
            file,
            fileKey: fileKey(file),
            fileName: file.name,
            title: fallback.title || stripExt(file.name) || 'Untitled',
            artist: fallback.artist || 'Unknown Artist',
            album: fallback.album || 'Singles',
            year: '',
            trackNumber: 0,
            dateAdded: Date.now(),
            coverDataUrl: '',
            lyrics: '',
            albumId: normalizeForSort(fallback.album || 'Singles') || 'singles',
            normGain: 1,
            absVolume: 1,
            duration: 0,
          };
          track.dedupeKey = legacyTrackSignature(track);
          const keys = [track.dedupeKey, track.fileKey].filter(Boolean);
          if (keys.some((key) => existing.has(key))) {
            skipped += 1;
            continue;
          }
          keys.forEach((key) => existing.add(key));
          imported.push(track);
          state.library.push(track);
          try {
            await dbSet('tracks', track);
          } catch (storageErr) {
            console.warn('Track added in memory but could not be saved yet', storageErr);
          }
        } catch (fallbackErr) {
          console.warn('Fallback import also failed', fallbackErr);
        }
      }
    }

    if (remember) await rememberFolderHint('Files imported from the selected folder.');
    renderAll();
    if (imported.length) {
      toast(`Imported ${imported.length} track${imported.length === 1 ? '' : 's'}${skipped ? ` · skipped ${skipped}` : ''}${failed ? ` · recovered ${failed}` : ''}`);
    } else {
      toast(`Nothing new imported${skipped ? ` · skipped ${skipped}` : ''}${failed ? ` · failed ${failed}` : ''}`);
    }
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
      const seen = new Set();
      const normalized = [];
      for (const track of state.library) {
        const album = normalizeAlbumLabel(track.album);
        const next = {
          ...track,
          album,
          albumId: normalizeForSort(album) || 'singles',
          absVolume: Number(track.absVolume) || 1,
        };
        if (!next.dedupeKey) next.dedupeKey = legacyTrackSignature(next);
        const signature = next.dedupeKey || legacyTrackSignature(next);
        if (seen.has(signature)) {
          changed = true;
          if (track?.id) await dbDelete('tracks', track.id);
          continue;
        }
        seen.add(signature);
        if (album !== track.album || typeof track.absVolume !== 'number' || next.dedupeKey !== track.dedupeKey) changed = true;
        normalized.push(next);
      }
      state.library = normalized;
      if (changed) {
        for (const track of state.library) await dbSet('tracks', track);
      }
      await restoreAlbumCoverPrefs();
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
    renderAuthors();
    renderSearchResults();
    renderMiniPlayer();
    renderQueue();
    updateSortButtonText();
    updateMasterGain();
    refreshScrollingTexts();
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

  function updateSongVolumeControls(track = findTrack(state.currentTrackId)) {
    const value = clamp(Number(track?.absVolume) || 1, ABS_VOLUME_MIN, ABS_VOLUME_MAX);
    if (els.absVolumeSlider) els.absVolumeSlider.value = String(value);
    if (els.absVolumeReadout) els.absVolumeReadout.textContent = `${value.toFixed(1)}×`;
  }

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    // 1. Set Metadata
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      album: track.album || '',
      artwork: [
        { src: 'img/lier-192.png', sizes: '192x192', type: 'image/png' }
      ]
    });

    // 2. Set State
    navigator.mediaSession.playbackState = els.audio.paused ? 'paused' : 'playing';

    // 3. FORCE-BIND HANDLERS (The Fix)
    // We bind these immediately here so they are fresh for the OS
    navigator.mediaSession.setActionHandler('play', () => {
      // Must be purely synchronous to avoid OS rejection
      if (els.audio.paused) {
        els.audio.play().catch(e => console.warn(e));
        // Only trigger the visual updates, keep audio logic out of the way
        navigator.mediaSession.playbackState = 'playing';
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      // Must be purely synchronous
      els.audio.pause();
      navigator.mediaSession.playbackState = 'paused';
    });
    
    // Optional: handle next/prev if you have them
    navigator.mediaSession.setActionHandler('previoustrack', goPrev);
    navigator.mediaSession.setActionHandler('nexttrack', goNext);
  }

  function openAlbumFromSong(trackId) {
    const track = findTrack(trackId);
    if (!track) return;
    displayTab('albums');
    openAlbum(track.albumId || normalizeForSort(track.album) || 'singles');
  }

  function openAuthorFromSong(trackId) {
    const track = findTrack(trackId);
    if (!track) return;
    displayTab('authors');
    openAuthor(normalizeForSort(track.artist) || 'unknown');
  }

  function bindTouchQueueDrag() {
    let activeDrag = null;
    let longPressTimer = null;

    function startDrag(row, e) {
      const rect = row.getBoundingClientRect();
      activeDrag = {
        row,
        startY: e.type.includes('touch') ? e.touches[0].clientY : e.clientY,
        startTop: rect.top,
        placeholder: document.createElement('article')
      };
      
      // Clean glowing insert line
      activeDrag.placeholder.className = 'queue-row placeholder';
      activeDrag.placeholder.style.height = `4px`; 
      activeDrag.placeholder.style.background = 'var(--accent)';
      activeDrag.placeholder.style.border = 'none';
      activeDrag.placeholder.style.margin = '4px 0';
      activeDrag.placeholder.style.padding = '0';
      activeDrag.placeholder.style.minHeight = '0';

      row.parentNode.insertBefore(activeDrag.placeholder, row);
      row.style.position = 'fixed';
      row.style.top = `${rect.top}px`;
      row.style.left = `${rect.left}px`;
      row.style.width = `${rect.width}px`;
      row.style.zIndex = '100';
      row.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';
      row.style.transition = 'none';
      row.classList.add('dragging');
    }

    els.queueList.addEventListener('touchstart', (e) => {
      const handle = e.target.closest('.queue-handle');
      const row = e.target.closest('.queue-row');
      if (!row) return;

      if (handle) {
        e.preventDefault();
        startDrag(row, e);
      } else {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          startDrag(row, e);
        }, 400); // Trigger long press drag after 400ms
      }
    }, { passive: false });

    els.queueList.addEventListener('touchmove', (e) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!activeDrag) return;
      e.preventDefault();

      const y = e.touches[0].clientY;
      const dy = y - activeDrag.startY;
      activeDrag.row.style.top = `${activeDrag.startTop + dy}px`; // Vertical drag only

      const siblings = Array.from(els.queueList.querySelectorAll('.queue-row:not(.placeholder):not(.dragging)'));
      const sibling = siblings.find(s => {
        const sRect = s.getBoundingClientRect();
        return y > sRect.top && y < sRect.bottom;
      });

      if (sibling) {
        const sRect = sibling.getBoundingClientRect();
        if (y < sRect.top + sRect.height / 2) {
          els.queueList.insertBefore(activeDrag.placeholder, sibling);
        } else {
          els.queueList.insertBefore(activeDrag.placeholder, sibling.nextSibling);
        }
      }
    }, { passive: false });

    els.queueList.addEventListener('touchend', (e) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!activeDrag) return;

      activeDrag.row.style.position = '';
      activeDrag.row.style.top = '';
      activeDrag.row.style.left = '';
      activeDrag.row.style.width = '';
      activeDrag.row.style.zIndex = '';
      activeDrag.row.style.boxShadow = '';
      activeDrag.row.classList.remove('dragging');

      els.queueList.insertBefore(activeDrag.row, activeDrag.placeholder);
      activeDrag.placeholder.remove();

      const newQueueIds = Array.from(els.queueList.querySelectorAll('.queue-row:not(.placeholder)'))
        .map(r => r.dataset.trackId)
        .filter(Boolean);

      state.queue = newQueueIds;
      state.currentIndex = state.queue.indexOf(state.currentTrackId);
      renderQueue(); 
      activeDrag = null;
    });
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
      const ids = sortTracks(state.library).map((t) => t.id);
      if (!ids.length) return toast('No songs to play');
      setQueue(ids, 0, 'songs');
      openPlayer();
      startPlayback();
    });

    els.shuffleAllBtn.addEventListener('click', async () => {
      const ids = sortTracks(state.library).map((t) => t.id);
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
    els.folderInput.addEventListener('change', async () => {
      await importFiles(els.folderInput.files, { remember: true });
      els.folderInput.value = '';
    });

    els.searchInput.addEventListener('input', () => {
      state.searchQuery = els.searchInput.value;
      renderSearchResults();
    });

    if (els.albumSearchInput) {
      els.albumSearchInput.addEventListener('input', () => {
        state.albumSearchQuery = els.albumSearchInput.value;
        renderAlbums();
      });
    }

    if (els.authorSearchInput) {
      els.authorSearchInput.addEventListener('input', () => {
        state.authorSearchQuery = els.authorSearchInput.value;
        renderAuthors();
      });
    }

    els.albumBackBtn.addEventListener('click', () => displayTab('albums'));
    if (els.authorBackBtn) els.authorBackBtn.addEventListener('click', () => displayTab('authors'));

    els.playAlbumBtn.addEventListener('click', async () => {
      const album = groupAlbums().find((a) => a.id === state.albumId);
      if (!album) return;
      const ids = [...album.tracks].sort((a, b) => (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0) || compareTextValues(a.title, b.title)).map((t) => t.id);
      setQueue(ids, 0, 'album', album.id);
      openPlayer();
      startPlayback();
    });

    els.shuffleAlbumBtn.addEventListener('click', async () => {
      const album = groupAlbums().find((a) => a.id === state.albumId);
      if (!album) return;
      const ids = album.tracks.map((t) => t.id);
      fisherYates(ids);
      setQueue(ids, 0, 'album', album.id);
      openPlayer();
      startPlayback();
    });

    if (els.playAuthorBtn) {
      els.playAuthorBtn.addEventListener('click', async () => {
        const author = groupAuthors().find((a) => a.id === state.authorId);
        if (!author) return;
        const ids = [...author.tracks].sort((a, b) => compareTextValues(a.title, b.title)).map((t) => t.id);
        setQueue(ids, 0, 'author', author.id);
        openPlayer();
        startPlayback();
      });
    }

    if (els.shuffleAuthorBtn) {
      els.shuffleAuthorBtn.addEventListener('click', async () => {
        const author = groupAuthors().find((a) => a.id === state.authorId);
        if (!author) return;
        const ids = author.tracks.map((t) => t.id);
        fisherYates(ids);
        setQueue(ids, 0, 'author', author.id);
        openPlayer();
        startPlayback();
      });
    }

    els.playerAlbum.addEventListener('click', () => {
      if (state.currentTrackId) openAlbumFromSong(state.currentTrackId);
    });

    els.playerArtist.addEventListener('click', () => {
      if (state.currentTrackId) openAuthorFromSong(state.currentTrackId);
    });

    els.playerBackBtn.addEventListener('click', closePlayerToMini);
    els.miniPlayer.addEventListener('click', (e) => {
      if (e.target.closest('.mini-controls')) return;
      togglePlayerSize();
    });

    els.miniPrevBtn.addEventListener('click', goPrev);
    els.miniPlayBtn.addEventListener('click', togglePlayPause);
    els.miniNextBtn.addEventListener('click', goNext);

    els.reshuffleBtn.addEventListener('click', () => shuffleQueue(true));
    els.loopAlbumBtn.addEventListener('click', () => {
      state.repeatAlbum = !state.repeatAlbum;
      updateLoopButton();
      toast(state.repeatAlbum ? 'Queue loop enabled' : 'Queue loop disabled');
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
      updateMediaSessionPosition();
    });

    els.volumeSlider.addEventListener('input', () => {
      updateMasterGain();
    });

    if (els.absVolumeSlider) {
      els.absVolumeSlider.min = String(ABS_VOLUME_MIN);
      els.absVolumeSlider.max = String(ABS_VOLUME_MAX);
      els.absVolumeSlider.step = String(ABS_VOLUME_STEP);
      els.absVolumeSlider.addEventListener('input', async () => {
        const track = findTrack(state.currentTrackId);
        if (!track) return;
        const value = clamp(Number(els.absVolumeSlider.value) || 1, ABS_VOLUME_MIN, ABS_VOLUME_MAX);
        track.absVolume = value;
        if (els.absVolumeReadout) els.absVolumeReadout.textContent = `${value.toFixed(1)}×`;
        await dbSet('tracks', track);
        updateMasterGain();
      });
    }

    els.bassSlider.addEventListener('input', applyEQ);
    els.midSlider.addEventListener('input', applyEQ);
    els.trebleSlider.addEventListener('input', applyEQ);

    els.audio.addEventListener('timeupdate', () => {
      if (!seekDragging) updateTimeUi();
    });
    els.audio.addEventListener('loadedmetadata', () => {
      updateTimeUi();
      updateMediaSessionPosition();
    });
    els.audio.addEventListener('ended', () => { goNext(); updateMediaSession(); });
    els.audio.addEventListener('play', () => {
      renderMiniPlayer();
      updateMediaSession();
      updateMediaSessionPosition();
    });
    els.audio.addEventListener('pause', () => {
      renderMiniPlayer();
      updateMediaSession();
      updateMediaSessionPosition();
    });
    els.audio.addEventListener('error', () => toast('Could not play this file'));

    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      if (!state.directAudioMode && audioCtx && audioCtx.state === 'suspended') {
        try { await audioCtx.resume(); } catch (err) { console.warn(err); }
      }
      renderMiniPlayer();
      updateTimeUi();
    });

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        if (state.currentTrackId && !els.audio.paused) {
          els.audio.pause();
          toast('Playback paused after an audio device change');
        }
      });
    }

    window.addEventListener('resize', () => refreshScrollingTexts());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.sortMenu.classList.contains('hidden')) {
          els.sortMenu.classList.add('hidden');
          els.sortBtn.setAttribute('aria-expanded', 'false');
        } else if (state.view === 'player') {
          closePlayerToMini();
        } else if (state.view === 'album' || state.view === 'author') {
          displayTab(state.activeTab || 'songs');
        }
      }
    });

    bindSwipe();
    bindTouchQueueDrag();
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
      const order = ['songs', 'albums', 'authors', 'search'];
      const idx = order.indexOf(state.activeTab);
      if (dx < 0 && idx < order.length - 1) displayTab(order[idx + 1]);
      if (dx > 0 && idx > 0) displayTab(order[idx - 1]);
    }, { passive: true });
  }

  // Desktop HTML5 drag fallback
  // Desktop HTML5 drag fallback
  const desktopPlaceholder = document.createElement('article');
  desktopPlaceholder.className = 'queue-row placeholder';
  desktopPlaceholder.style.height = '4px';
  desktopPlaceholder.style.background = 'var(--accent)';
  desktopPlaceholder.style.border = 'none';
  desktopPlaceholder.style.margin = '4px 0';
  desktopPlaceholder.style.padding = '0';
  desktopPlaceholder.style.minHeight = '0';

  function onQueueDragStart(e) {
    if (e.pointerType === 'touch') return; 
    queueDraggingId = e.currentTarget.dataset.trackId;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', queueDraggingId);
  }

  function onQueueDragOver(e) {
    e.preventDefault();
    if (!queueDraggingId) return;
    
    // Find the row we are currently hovering over
    const targetRow = e.target.closest('.queue-row:not(.placeholder):not(.dragging)');
    if (!targetRow) return;

    // Calculate if we are hovering over the top half or bottom half of the row
    const rect = targetRow.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      targetRow.parentNode.insertBefore(desktopPlaceholder, targetRow);
    } else {
      targetRow.parentNode.insertBefore(desktopPlaceholder, targetRow.nextSibling);
    }
  }

  function onQueueDrop(e) {
    e.preventDefault();
    if (!queueDraggingId) return;
    
    // Move the actual row to where the placeholder is
    const draggedRow = els.queueList.querySelector(`[data-track-id="${queueDraggingId}"]`);
    if (draggedRow && desktopPlaceholder.parentNode) {
      els.queueList.insertBefore(draggedRow, desktopPlaceholder);
    }
    
    desktopPlaceholder.remove();
    
    // Save the new order to the database
    const newQueueIds = Array.from(els.queueList.querySelectorAll('.queue-row:not(.placeholder)'))
      .map(r => r.dataset.trackId)
      .filter(Boolean);

    state.queue = newQueueIds;
    state.currentIndex = state.queue.indexOf(state.currentTrackId);
    renderQueue();
  }

  function onQueueDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    if (desktopPlaceholder.parentNode) desktopPlaceholder.remove();
    queueDraggingId = null;
  }

  function renderLibraryState() {
    if (!state.library.length) {
      setImage(els.albumHeroArt, fallbackCover());
      if (els.authorHeroArt) setImage(els.authorHeroArt, fallbackCover());
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
    if (state.view === 'author' && state.authorId) {
      const author = groupAuthors().find((a) => a.id === state.authorId);
      return author ? author.tracks.map((t) => t.id) : [];
    }
    return sortTracks(getFilteredLibrary()).map((t) => t.id);
  }

  async function hydrateExistingFiles() {
    const existing = new Set(state.library.map((t) => t.fileKey).filter(Boolean));
    return existing;
  }

  async function presetImages() {
    setImage(els.albumHeroArt, fallbackCover());
    if (els.authorHeroArt) setImage(els.authorHeroArt, fallbackCover());
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
  els.volReadout.textContent = `${Math.round(Number(els.volumeSlider.value))}%`;
  if (els.absVolumeSlider) {
    els.absVolumeSlider.min = String(ABS_VOLUME_MIN);
    els.absVolumeSlider.max = String(ABS_VOLUME_MAX);
    els.absVolumeSlider.step = String(ABS_VOLUME_STEP);
  }
  updateSongVolumeControls();
  syncAudioVolume();
  updateMasterGain();
  applyEQ();
  updateTimeUi();
  presetImages();
  els.miniPlayer.classList.add('hidden');

  if (state.directAudioMode) {
    const eqBlock = $('#eqBlock');
    const volBlock = $('.volume-block');
    if (eqBlock) eqBlock.style.display = 'none';
    if (volBlock) volBlock.style.display = 'none';
  }

  window.selectTrack = selectTrack;
  window.removeFromQueue = removeFromQueue;
})();
