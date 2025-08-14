// bumble-lite front-end
(function(){
  const el = (id) => document.getElementById(id);
  const loginScreen = el('login-screen');
  const mainScreen = el('main-screen');
  const loginForm = el('login-form');
  const usernameInput = el('username');
  const passwordInput = el('password');
  const otherUsername = el('other-username');
  const likeBtn = el('like-btn');
  const superLikeBtn = el('super-like-btn');
  const nextBtn = el('next-btn');
  const card = el('card');
  const cardImg = el('card-img');
  const emptyFeed = el('empty-feed');
  const fileInput = el('file-input');
  const uploadBtn = el('upload-btn');
  const uploadStatus = el('upload-status');
  const openSettings = el('open-settings');
  const settingsDialog = el('settings-dialog');
  const settingsForm = el('settings-form');
  const ghOwner = el('gh-owner');
  const ghRepo = el('gh-repo');
  const ghBranch = el('gh-branch');
  const ghToken = el('gh-token');
  const logoutBtn = el('logout');

  // --- App State ---
  let state = {
    me: null,                // 'hardik' | 'ananya'
    other: null,             // opposite of 'me'
    feed: [],                // array of image URLs
    feedIdx: 0,              // current index
    repo: { owner: '', repo: '', branch: 'main', token: '' }
  };

  // Try to infer owner/repo from GitHub Pages URL
  function inferRepoFromLocation(){
    // https://<owner>.github.io/<repo>/...
    const { host, pathname } = window.location;
    const m = host.match(/^([^.]+)\.github\.io$/);
    const pathParts = pathname.replace(/^\//,'').split('/').filter(Boolean);
    if(m && pathParts.length){
      return { owner: m[1], repo: pathParts[0] };
    }
    return null;
  }

  // Load repo settings from localStorage
  function loadRepoSettings(){
    const saved = localStorage.getItem('ghRepoCfg');
    if(saved){
      try { state.repo = JSON.parse(saved); } catch(e){}
    } else {
      const inferred = inferRepoFromLocation();
      state.repo = {
        owner: inferred?.owner || '',
        repo: inferred?.repo || '',
        branch: 'main',
        token: ''
      };
    }
    ghOwner.value = state.repo.owner || '';
    ghRepo.value = state.repo.repo || '';
    ghBranch.value = state.repo.branch || 'main';
    ghToken.value = state.repo.token || '';
  }
  function saveRepoSettings(){
    state.repo.owner = ghOwner.value.trim();
    state.repo.repo = ghRepo.value.trim();
    state.repo.branch = ghBranch.value.trim() || 'main';
    state.repo.token = ghToken.value.trim();
    localStorage.setItem('ghRepoCfg', JSON.stringify(state.repo));
  }

  // --- Auth (two fixed accounts) ---
  const USERS = {
    'hardik': 'iloveananya',
    'ananya': 'ilovehardik'
  };
  function persistSession(){
    localStorage.setItem('bumbleLiteSession', JSON.stringify({ me: state.me, ts: Date.now() }));
  }
  function loadSession(){
    try{
      const s = JSON.parse(localStorage.getItem('bumbleLiteSession')||'null');
      if(s?.me && USERS[s.me]){
        state.me = s.me;
        state.other = (state.me === 'hardik') ? 'ananya' : 'hardik';
        return true;
      }
    } catch(e){}
    return false;
  }
  function clearSession(){
    localStorage.removeItem('bumbleLiteSession');
  }

  // --- Image compression utilities ---
  function compressImage(file, maxSizeKB = 1000, quality = 0.8) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions to stay under size limit
        let { width, height } = img;
        const maxDim = 1920; // Max dimension
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height * maxDim) / width;
            width = maxDim;
          } else {
            width = (width * maxDim) / height;
            height = maxDim;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try different quality levels to stay under size limit
        const tryCompress = (q) => {
          canvas.toBlob((blob) => {
            if (blob && blob.size <= maxSizeKB * 1024) {
              // Convert blob back to File
              const compressedFile = new File([blob], file.name, {
                type: blob.type,
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else if (q > 0.1) {
              tryCompress(q - 0.1);
            } else {
              // If we can't compress enough, return original
              resolve(file);
            }
          }, file.type, q);
        };
        
        tryCompress(quality);
      };
      
      img.src = URL.createObjectURL(file);
    });
  }

  // --- GitHub API helpers ---
  const GH_API = 'https://api.github.com';

  async function githubListImages(user){
    const path = `images/${user}`;
    if(!state.repo.owner || !state.repo.repo){
      // No repo configured, try local fallback
      return listLocalImages(user);
    }
    const url = `${GH_API}/repos/${state.repo.owner}/${state.repo.repo}/contents/${encodeURIComponent(path)}?r=${Date.now()}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if(resp.status === 404){
      return []; // folder not found yet
    }
    if(!resp.ok){
      console.warn('GitHub list error', resp.status);
      throw new Error('Failed to list images from GitHub');
    }
    const data = await resp.json();
    // Filter images and map to download_url
    return (Array.isArray(data) ? data : [])
      .filter(it => /(\.png|\.jpg|\.jpeg|\.webp|\.gif)$/i.test(it.name))
      .map(it => it.download_url);
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Read error'));
      reader.onload = () => {
        const res = reader.result || '';
        // res is like "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ..."
        const base64 = String(res).split(',')[1] || '';
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }
  
  async function githubUploadImage(user, file){
    if(!state.repo.token || !state.repo.owner || !state.repo.repo){
      // local fallback only
      return localSave(user, file);
    }
    
    // Compress image if it's too large
    let processedFile = file;
    if (file.size > 1000 * 1024) { // If larger than 1MB
      uploadStatus.textContent = 'Compressing image...';
      processedFile = await compressImage(file);
    }
    
    const base64 = await fileToBase64(processedFile);
    const safeName = `${Date.now()}-${file.name.replace(/[^a-z0-9_.-]/gi,'_')}`;
    const path = `images/${user}/${safeName}`;
    const url = `${GH_API}/repos/${state.repo.owner}/${state.repo.repo}/contents/${encodeURIComponent(path)}`;
    const body = {
      message: `chore: add ${user} image ${safeName}`,
      content: base64,
      branch: state.repo.branch
    };
    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.repo.token}`
      },
      body: JSON.stringify(body)
    });
    if(!resp.ok){
      const t = await resp.text();
      throw new Error(`GitHub upload failed: ${resp.status} ${t}`);
    }
    return true;
  }

  // Local fallback (non-persistent to GitHub; stays in this browser)
  function localKey(user){ return `localImages_${user}`; }
  async function localSave(user, file){
    const reader = new FileReader();
    const res = await new Promise((resolve, reject) => {
      reader.onerror = () => reject(new Error('Read error'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const arr = JSON.parse(localStorage.getItem(localKey(user)) || '[]');
    arr.push(res);
    localStorage.setItem(localKey(user), JSON.stringify(arr));
    return true;
  }
  function listLocalImages(user){
    const arr = JSON.parse(localStorage.getItem(localKey(user)) || '[]');
    return arr;
  }

  // --- Feed logic ---
  async function loadFeed(){
    otherUsername.textContent = state.other;
    try {
      const imgs = await githubListImages(state.other);
      state.feed = imgs;
      state.feedIdx = 0;
      renderCard();
    } catch(e){
      console.error(e);
      state.feed = [];
      state.feedIdx = 0;
      renderCard();
    }
  }

  function renderCard(){
    if(!state.feed.length || state.feedIdx >= state.feed.length){
      cardImg.removeAttribute('src');
      emptyFeed.hidden = false;
      return;
    }
    emptyFeed.hidden = true;
    cardImg.src = state.feed[state.feedIdx];
  }

  function nextCard(){
    state.feedIdx = Math.min(state.feedIdx + 1, state.feed.length);
    renderCard();
  }

  function likeCurrent(isSuper = false){
    if(!state.feed.length || state.feedIdx >= state.feed.length) return;
    const img = state.feed[state.feedIdx];
    
    // Store like locally per user
    const k = isSuper ? `superlikes_${state.me}` : `likes_${state.me}`;
    const likes = JSON.parse(localStorage.getItem(k) || '[]');
    if(!likes.includes(img)) likes.push(img);
    localStorage.setItem(k, JSON.stringify(likes));

    // Animate and go next
    const animClass = isSuper ? 'super-like' : 'swipe-right';
    card.classList.remove('swipe-right', 'super-like');
    void card.offsetWidth; // reflow
    card.classList.add(animClass);
    setTimeout(() => {
      card.classList.remove(animClass);
      nextCard();
    }, 250);
  }

  // --- Touch gestures (right swipe and swipe up for super like) ---
  let touchStartX = null, touchStartY = null;
  card.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX; touchStartY = t.clientY;
  }, {passive: true});
  
  card.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = touchStartY - t.clientY; // Inverted for upward swipe
    const horizontalDistance = Math.abs(dx);
    const verticalDistance = Math.abs(dy);
    
    if (dy > 60 && verticalDistance > horizontalDistance) {
      // Swipe up for super like
      likeCurrent(true);
    } else if (dx > 40 && horizontalDistance > verticalDistance) {
      // Right swipe for regular like
      likeCurrent(false);
    }
  }, {passive: true});

  // --- UI Events ---
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = usernameInput.value.trim().toLowerCase();
    const p = passwordInput.value;
    if(USERS[u] && USERS[u] === p){
      state.me = u;
      state.other = (u === 'hardik') ? 'ananya' : 'hardik';
      persistSession();
      loginScreen.classList.remove('visible');
      mainScreen.classList.add('visible');
      loadFeed();
    } else {
      alert('Invalid credentials');
    }
  });

  likeBtn.addEventListener('click', () => likeCurrent(false));
  superLikeBtn.addEventListener('click', () => likeCurrent(true));
  nextBtn.addEventListener('click', nextCard);

  uploadBtn.addEventListener('click', async () => {
    if(!state.me){ alert('Please log in first'); return; }
    const files = fileInput.files;
    if(!files || !files.length){ alert('Pick image(s) first'); return; }
    
    // Check file sizes
    const oversizedFiles = Array.from(files).filter(file => file.size > 5 * 1024 * 1024); // 5MB limit
    if (oversizedFiles.length > 0) {
      alert(`Some files are too large (>5MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }
    
    uploadStatus.textContent = 'Uploading...';
    let ok = 0, fail = 0;
    for(const file of files){
      try{
        await githubUploadImage(state.me, file);
        ok++;
        uploadStatus.textContent = `Uploaded ${ok}/${files.length} files...`;
      } catch(err){
        console.error(err);
        fail++;
      }
    }
    uploadStatus.textContent = (state.repo.token && state.repo.owner && state.repo.repo)
      ? `Uploaded ${ok} file(s) to GitHub. ${fail ? fail+' failed.' : ''}`
      : `Saved ${ok} locally (no GitHub token configured). ${fail ? fail+' failed.' : ''}`;
    fileInput.value = '';
    // If I uploaded my images, the other user will see them; my own feed is unaffected
  });

  openSettings.addEventListener('click', () => {
    loadRepoSettings();
    settingsDialog.showModal();
  });
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveRepoSettings();
    settingsDialog.close();
    // Reload feed in case repo changed
    loadFeed();
  });

  logoutBtn.addEventListener('click', () => {
    clearSession();
    state.me = null;
    state.other = null;
    loginScreen.classList.add('visible');
    mainScreen.classList.remove('visible');
  });

  // Boot
  loadRepoSettings();
  if(loadSession()){
    loginScreen.classList.remove('visible');
    mainScreen.classList.add('visible');
    loadFeed();
  } else {
    loginScreen.classList.add('visible');
  }
})();
