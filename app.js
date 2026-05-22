<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#111111" />
  <title>Folk Fawn</title>
  <link rel="stylesheet" href="styles.css" />
  <link rel="manifest" href="manifest.json">
  <link rel="icon" type="image/x-icon" href="/img/lier.png">
</head>
<body>
  <div id="appShell" class="app-shell">
    <aside class="tabbar" id="tabbar" aria-label="Primary tabs">
      <div class="brand">
        <span class="brand-mark">෴</span>
        <span class="brand-name">Folk Fawn</span>
      </div>
      <button class="tab-btn active" data-tab="songs" aria-current="page">Songs</button>
      <button class="tab-btn" data-tab="albums">Albums</button>
      <button class="tab-btn" data-tab="search">Search</button>
    </aside>

    <main class="main-pane">
      <header class="top-bar">
        <div>
          <p class="eyebrow" id="crumb">Library</p>
          <h1 id="screenTitle">Folk Fawn</h1>
        </div>
        <div class="top-actions">
          <button class="ghost-btn sort-trigger" id="sortBtn" aria-haspopup="menu" aria-expanded="false">Title ▾</button>
          <div class="sort-menu hidden" id="sortMenu" role="menu" aria-label="Sort options">
            <button data-sort="title">Title</button>
            <button data-sort="artist">Artist</button>
            <button data-sort="album">Album</button>
            <button data-sort="year">Year Released</button>
            <button data-sort="dateAdded">Date Added</button>
          </div>
        </div>
      </header>

      <section id="songsView" class="view active">
        <div class="section-head">
          <div>
            <h2>Songs</h2>
            <p class="subtle" id="songsCount">No songs loaded yet.</p>
          </div>
          <div class="row-actions">
            <button class="primary-btn" id="playAllBtn">Play</button>
            <button class="secondary-btn" id="shuffleAllBtn">Shuffle</button>
          </div>
        </div>
        <div class="list" id="songsList"></div>
      </section>

      <section id="albumsView" class="view">
        <div class="section-head">
          <div>
            <h2>Albums</h2>
            <p class="subtle" id="albumsCount">No albums loaded yet.</p>
          </div>
        </div>
        <div class="album-grid" id="albumsGrid"></div>
      </section>

      <section id="searchView" class="view">
        <div class="section-head stack-mobile">
          <div>
            <h2>Search</h2>
            <p class="subtle">Find tracks, import files, or point the app at your music folder.</p>
          </div>
          <div class="row-actions wrap">
            <button class="primary-btn" id="pickFolderBtn">Choose Music Folder</button>
            <button class="secondary-btn" id="importFilesBtn">Import MP3 Files</button>
            <input id="fileInput" type="file" accept="audio/mpeg,.mp3,.mpeg" multiple hidden />
            <input id="folderInput" type="file" accept="audio/mpeg,.mp3,.mpeg" multiple webkitdirectory hidden />
          </div>
        </div>

        <label class="search-box">
          <span>Search library</span>
          <input id="searchInput" type="search" placeholder="Title, artist, album, year" />
        </label>

        <div class="import-note" id="folderNote">No folder selected yet.</div>
        <div class="list" id="searchList"></div>
      </section>

      <section id="albumView" class="view album-view">
        <button class="back-btn" id="albumBackBtn">← Back</button>
        <div class="album-hero">
          <img id="albumHeroArt" class="hero-art large" alt="Album art" />
          <div class="album-hero-meta">
            <p class="eyebrow">Album</p>
            <h2 id="albumHeroTitle">Album</h2>
            <p class="subtle" id="albumHeroMeta"></p>
          </div>
        </div>
        <p class="tiny-note">Tap the album art to cycle covers from songs in this album.</p>
        <div class="section-head compact-head">
          <div>
            <h3>Songs</h3>
          </div>
          <div class="row-actions">
            <button class="primary-btn" id="playAlbumBtn">Play Album</button>
            <button class="secondary-btn" id="shuffleAlbumBtn">Shuffle Album</button>
          </div>
        </div>
        <div class="list" id="albumSongsList"></div>
      </section>

      <section id="playerView" class="view player-view">
        <button class="back-btn" id="playerBackBtn">← Back</button>

        <div class="player-actions-left">
          <button class="ghost-btn" id="reshuffleBtn">Reshuffle</button>
          <button class="ghost-btn" id="loopAlbumBtn">Loop Album</button>
        </div>

        <div class="now-playing-card">
          <img id="playerArt" class="hero-art large" alt="Now playing cover" />
          <div class="now-meta">
            <p class="eyebrow">Now Playing</p>
            <h2 id="playerTitle">Nothing playing</h2>
            <p class="subtle" id="playerArtist"></p>
            <p class="subtle" id="playerAlbum"></p>
          </div>
        </div>

        <div class="slider-block">
          <div class="slider-labels"><span id="timeNow">0:00</span><span id="timeEnd">0:00</span></div>
          <input id="seekSlider" type="range" min="0" max="1000" value="0" />
        </div>

        <div class="slider-block">
          <div class="slider-labels"><span>Volume</span><span id="volReadout">80%</span></div>
          <input id="volumeSlider" type="range" min="0" max="35" value="25" />
        </div>

        <details class="dropdown-block" id="upNextBlock">
          <summary>Up Next</summary>
          <div class="dropdown-inner">
            <p class="tiny-note">Drag to reorder. Remove skips the item from the queue.</p>
            <div id="queueList" class="queue-list"></div>
          </div>
        </details>

        <details class="dropdown-block" id="lyricsBlock">
          <summary>Lyrics</summary>
          <div class="dropdown-inner">
            <pre id="lyricsText">No embedded lyrics found.</pre>
          </div>
        </details>

        <details class="dropdown-block" id="eqBlock">
          <summary>Equalizer</summary>
          <div class="dropdown-inner eq-grid" id="eqGrid">
            <label><span>Bass</span><input id="bassSlider" type="range" min="-12" max="12" value="0" /></label>
            <label><span>Mid</span><input id="midSlider" type="range" min="-12" max="12" value="0" /></label>
            <label><span>Treble</span><input id="trebleSlider" type="range" min="-12" max="12" value="0" /></label>
          </div>
        </details>
      </section>
    </main>

    <section id="miniPlayer" class="mini-player hidden" aria-label="Mini player">
      <button class="mini-expand" id="miniExpandBtn" title="Open or collapse player">⤢</button>
      <img id="miniArt" alt="" />
      <div class="mini-info" id="miniInfo">
        <strong id="miniTitle">Nothing playing</strong>
        <span id="miniArtist"></span>
      </div>
      <div class="mini-controls">
        <button id="miniPrevBtn" title="Previous">⏮</button>
        <button id="miniPlayBtn" title="Play/Pause">▶</button>
        <button id="miniNextBtn" title="Next">⏭</button>
      </div>
    </section>

    <audio id="audio" preload="metadata" playsinline webkit-playsinline></audio>
  </div>

  <script src="app.js"></script>
</body>
</html>
