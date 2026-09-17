/* ============================
   reCAPTCHA BULMACA + EL TAKİBİ
   ============================ */

const GRID_SIZE = 3;
const CANVAS_SIZE = 480;

// Game state
let positions = [];
let selectedSlot = -1;
let moveCount = 0;
let timerInterval = null;
let startTime = null;
let elapsed = 0;
let capturedCanvas = null;
let playing = false;
let stream = null;

// Hand tracking state
let handTracker = null;
let handActive = false;
let cursorTarget = { x: 0, y: 0 };
let cursorSmooth = { x: 0, y: 0 };
let cursorAnimId = null;

// Drag state
let grabbedSlot = -1;
let isPinching = false;
let wasPinching = false;
let currentHoverSlot = -1;
let pinchDebounce = false;
let ghostEl = null; // Sürüklenen hareketli parça

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const screens = {
    landing: $('#screen-landing'),
    camera: $('#screen-camera'),
    puzzle: $('#screen-puzzle'),
    congrats: $('#screen-congrats'),
};

// ——— SCREEN NAV ———
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// ——— reCAPTCHA CHECKBOX CLICK ———
$('.recaptcha-box').addEventListener('click', () => {
    const checkbox = $('.checkbox');
    const checkSvg = $('.checkmark-svg');

    // Show loading spinner
    checkbox.classList.add('loading');
    checkSvg.classList.add('hidden');
    checkSvg.classList.remove('visible');

    // Simulate "verification" delay, then go to camera
    setTimeout(() => {
        checkbox.classList.remove('loading');
        checkSvg.classList.remove('hidden');
        checkSvg.classList.add('visible');

        // After checkmark shows, transition to camera
        setTimeout(() => {
            showScreen('camera');
            initCamera();
        }, 600);
    }, 1200);
});

// ——— CAMERA ———
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        $('#webcam').srcObject = stream;
    } catch (e) {
        console.error('Kamera hatası:', e);
    }
}

function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
}

// ——— CAPTURE BUTTON ———
$('#btn-capture').addEventListener('click', () => {
    $('#btn-capture').disabled = true;
    
    // Anında çekim
    capturePhoto();
    
    $('#flash-overlay').classList.add('flash');
    setTimeout(() => $('#flash-overlay').classList.remove('flash'), 350);

    setTimeout(() => {
        buildPuzzle();
        showScreen('puzzle');
        startTimer();
        startHandTracking();
        $('#btn-capture').disabled = false;
    }, 400);
});

// ——— CAPTURE PHOTO ———
function capturePhoto() {
    const v = $('#webcam');
    const c = $('#capture-canvas');
    const size = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;

    c.width = CANVAS_SIZE;
    c.height = CANVAS_SIZE;
    const ctx = c.getContext('2d');
    ctx.translate(CANVAS_SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, sx, sy, size, size, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    capturedCanvas = c;

    const ref = $('#reference-image');
    ref.width = 200; ref.height = 200;
    ref.getContext('2d').drawImage(c, 0, 0, CANVAS_SIZE, CANVAS_SIZE, 0, 0, 200, 200);
}

// ——— PUZZLE ———
function buildPuzzle() {
    playing = true;
    moveCount = 0;
    selectedSlot = -1;
    grabbedSlot = -1;
    const total = GRID_SIZE * GRID_SIZE;
    positions = Array.from({ length: total }, (_, i) => i);
    shuffle();

    const grid = $('#puzzle-grid');
    grid.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${GRID_SIZE}, 1fr)`;
    render();
}

function shuffle() {
    const n = positions.length;
    do {
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
    } while (solved());
}

function solved() { return positions.every((p, i) => p === i); }

function render() {
    const grid = $('#puzzle-grid');
    grid.innerHTML = '';
    const ps = CANVAS_SIZE / GRID_SIZE;

    positions.forEach((piece, slot) => {
        const div = document.createElement('div');
        div.className = 'puzzle-piece';
        div.dataset.slot = slot;
        if (piece === slot) div.classList.add('correct');

        const cvs = document.createElement('canvas');
        cvs.width = ps; cvs.height = ps;
        const ctx = cvs.getContext('2d');
        const row = Math.floor(piece / GRID_SIZE);
        const col = piece % GRID_SIZE;
        ctx.drawImage(capturedCanvas, col * ps, row * ps, ps, ps, 0, 0, ps, ps);

        div.appendChild(cvs);
        div.addEventListener('click', () => handleMouseClick(slot));
        grid.appendChild(div);
    });
}

function handleMouseClick(slot) {
    if (!playing) return;
    const pieces = $$('.puzzle-piece');

    if (selectedSlot === -1) {
        selectedSlot = slot;
        pieces[slot].classList.add('selected');
    } else if (selectedSlot === slot) {
        pieces[slot].classList.remove('selected');
        selectedSlot = -1;
    } else {
        doSwap(selectedSlot, slot);
        selectedSlot = -1;
    }
}

function doSwap(a, b) {
    [positions[a], positions[b]] = [positions[b], positions[a]];
    moveCount++;
    render();

    const fresh = $$('.puzzle-piece');
    fresh[a]?.classList.add('swap-anim');
    fresh[b]?.classList.add('swap-anim');
    setTimeout(() => {
        fresh[a]?.classList.remove('swap-anim');
        fresh[b]?.classList.remove('swap-anim');
    }, 250);

    if (solved()) {
        playing = false;
        setTimeout(() => { stopTimer(); stopHandTracking(); showDone(); }, 350);
    }
}

// ——— TIMER ———
function startTimer() {
    elapsed = 0;
    $('#timer-display').textContent = '00:00';
    startTime = performance.now();
    timerInterval = setInterval(() => {
        elapsed = Math.floor((performance.now() - startTime) / 1000);
        $('#timer-display').textContent = fmt(elapsed);
    }, 250);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    if (startTime) elapsed = Math.floor((performance.now() - startTime) / 1000);
}

function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ============================
//  HAND TRACKING — TUT → SÜRÜKLE → BIRAK
// ============================
function getSlotAtCursor() {
    const gridEl = $('#puzzle-grid');
    const container = $('#puzzle-grid-container');
    const containerRect = container.getBoundingClientRect();
    const gridRect = gridEl.getBoundingClientRect();

    const absX = containerRect.left + cursorSmooth.x;
    const absY = containerRect.top + cursorSmooth.y;
    const relX = absX - gridRect.left;
    const relY = absY - gridRect.top;

    if (relX < 0 || relY < 0 || relX > gridRect.width || relY > gridRect.height) return -1;

    const col = Math.floor(relX / (gridRect.width / GRID_SIZE));
    const row = Math.floor(relY / (gridRect.height / GRID_SIZE));
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return -1;
    return row * GRID_SIZE + col;
}

function updatePieceHighlights() {
    const pieces = $$('.puzzle-piece');
    pieces.forEach(p => p.classList.remove('grabbed', 'drop-target'));

    if (grabbedSlot >= 0 && grabbedSlot < pieces.length) {
        pieces[grabbedSlot].classList.add('hidden-drag');
    }
    if (grabbedSlot >= 0 && currentHoverSlot >= 0 && currentHoverSlot !== grabbedSlot && currentHoverSlot < pieces.length) {
        pieces[currentHoverSlot].classList.add('drop-target');
    }
}

async function startHandTracking() {
    const statusEl = $('#hand-status');
    statusEl.textContent = '✋ Yükleniyor...';
    statusEl.classList.remove('ready');

    const handVideo = $('#hand-video');
    handVideo.srcObject = stream;
    try { await handVideo.play(); } catch (e) {}

    if (typeof Hands === 'undefined') {
        statusEl.textContent = '⚠️ Yüklenemedi';
        return;
    }

    try {
        handTracker = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handTracker.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            selfieMode: true
        });

        handTracker.onResults(onHandResults);

        handActive = true;
        wasPinching = false;
        isPinching = false;
        grabbedSlot = -1;
        pinchDebounce = false;

        startCursorSmooth();
        trackLoop();

        statusEl.textContent = '✋ Hazır';
        statusEl.classList.add('ready');
    } catch (e) {
        console.error('Hand tracking hata:', e);
        statusEl.textContent = '⚠️ Başlatılamadı';
    }
}

async function trackLoop() {
    if (!handActive || !playing) return;
    const video = $('#hand-video');
    if (video.readyState >= 2) {
        try { await handTracker.send({ image: video }); } catch (e) {}
    }
    setTimeout(() => {
        if (handActive && playing) requestAnimationFrame(trackLoop);
    }, 50);
}

function onHandResults(results) {
    const cursor = $('#hand-cursor');
    const statusEl = $('#hand-status');

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        cursor.style.display = 'none';
        if (grabbedSlot >= 0) {
            grabbedSlot = -1;
            isPinching = false;
            wasPinching = false;
            updatePieceHighlights();
        }
        statusEl.textContent = '✋ Elini göster';
        statusEl.classList.add('ready');
        return;
    }

    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const wrist = landmarks[0];
    const indexBase = landmarks[5];

    const container = $('#puzzle-grid-container');
    const rect = container.getBoundingClientRect();
    cursorTarget.x = indexTip.x * rect.width;
    cursorTarget.y = indexTip.y * rect.height;
    cursor.style.display = 'block';

    // Dinamik Pinch (Kıskaç) Algılama: Elin uzaklığına göre ölçeklenir ve Hysteresis içerir.
    const palmSize = Math.hypot(indexBase.x - wrist.x, indexBase.y - wrist.y);
    const dist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const relativeDist = dist / palmSize;

    wasPinching = isPinching;
    if (isPinching) {
        // Zaten tutuyorsa, bırakması için parmaklarını DAHA FAZLA açması gerekir (kopmaları önler)
        isPinching = relativeDist < 0.65;
    } else {
        // Tutmaya başlaması için parmaklarını iyice yaklaştırması gerekir
        isPinching = relativeDist < 0.30;
    }

    currentHoverSlot = getSlotAtCursor();

    // PINCH START → GRAB
    if (isPinching && !wasPinching && !pinchDebounce) {
        if (currentHoverSlot >= 0) {
            grabbedSlot = currentHoverSlot;
            cursor.classList.add('dragging');
            cursor.classList.remove('pinch-feedback');
            void cursor.offsetHeight;
            cursor.classList.add('pinch-feedback');
            
            // Görsel olarak kopyasını oluştur (Ghost piece)
            const ps = CANVAS_SIZE / GRID_SIZE;
            ghostEl = document.createElement('canvas');
            ghostEl.className = 'ghost-piece';
            
            const gridRect = $('#puzzle-grid').getBoundingClientRect();
            ghostEl.style.setProperty('--ghost-size', (gridRect.width / GRID_SIZE) + 'px');
            ghostEl.width = ps;
            ghostEl.height = ps;
            
            const ctx = ghostEl.getContext('2d');
            const row = Math.floor(positions[grabbedSlot] / GRID_SIZE);
            const col = positions[grabbedSlot] % GRID_SIZE;
            ctx.drawImage(capturedCanvas, col * ps, row * ps, ps, ps, 0, 0, ps, ps);
            
            container.appendChild(ghostEl);
            
            statusEl.textContent = '🤏 Taşı ve bırak';
        }
    }

    // PINCH END → DROP
    if (!isPinching && wasPinching) {
        if (grabbedSlot >= 0) {
            const dropSlot = currentHoverSlot;
            
            // Ghost parçayı sil
            if (ghostEl) {
                ghostEl.remove();
                ghostEl = null;
            }

            if (dropSlot >= 0 && dropSlot !== grabbedSlot) {
                doSwap(grabbedSlot, dropSlot);
                statusEl.textContent = '✅ Yerleştirildi';
                pinchDebounce = true;
                setTimeout(() => { pinchDebounce = false; }, 400);
            } else {
                statusEl.textContent = '↩️ İptal';
            }
            grabbedSlot = -1;
            cursor.classList.remove('dragging');
        }
        setTimeout(() => {
            if (playing) statusEl.textContent = '👆 Tut → Taşı → Bırak';
        }, 800);
    }

    if (isPinching && grabbedSlot >= 0) {
        cursor.classList.add('dragging');
        if (ghostEl) {
            ghostEl.style.left = cursorTarget.x + 'px';
            ghostEl.style.top = cursorTarget.y + 'px';
        }
    }
    if (!isPinching && grabbedSlot < 0) cursor.classList.remove('dragging');

    updatePieceHighlights();
}

function startCursorSmooth() {
    cursorSmooth = { ...cursorTarget };
    function animate() {
        if (!handActive) return;
        cursorSmooth.x += (cursorTarget.x - cursorSmooth.x) * 0.35;
        cursorSmooth.y += (cursorTarget.y - cursorSmooth.y) * 0.35;
        const cursor = $('#hand-cursor');
        cursor.style.left = cursorSmooth.x + 'px';
        cursor.style.top = cursorSmooth.y + 'px';
        
        // Ghost motion smoothing
        if (ghostEl) {
            ghostEl.style.left = cursorSmooth.x + 'px';
            ghostEl.style.top = cursorSmooth.y + 'px';
        }

        cursorAnimId = requestAnimationFrame(animate);
    }
    animate();
}

function stopHandTracking() {
    handActive = false;
    isPinching = false;
    wasPinching = false;
    grabbedSlot = -1;
    if (cursorAnimId) { cancelAnimationFrame(cursorAnimId); cursorAnimId = null; }
    $('#hand-cursor').style.display = 'none';
    $('#hand-cursor').classList.remove('dragging');
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    if (handTracker) { handTracker.close(); handTracker = null; }
    $('#hand-video').srcObject = null;
}

// ——— DONE ———
function showDone() {
    $('#final-time').textContent = fmt(elapsed);
    const c = $('#completed-image');
    c.width = 520; c.height = 520;
    c.getContext('2d').drawImage(capturedCanvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE, 0, 0, 520, 520);
    stopCamera();
    showScreen('congrats');
    confetti();
}

function confetti() {
    const box = $('#confetti-container');
    box.innerHTML = '';
    const colors = ['#4285f4', '#ea4335', '#fbbc05', '#34a853', '#ff6d00', '#ab47bc'];
    for (let i = 0; i < 100; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-piece';
        const sz = Math.random() * 7 + 5;
        p.style.left = Math.random() * 100 + '%';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDelay = Math.random() * 1.8 + 's';
        p.style.animationDuration = (Math.random() * 2 + 2) + 's';
        p.style.width = sz + 'px';
        p.style.height = (Math.random() > 0.5 ? sz : sz * 0.4) + 'px';
        if (Math.random() > 0.7) p.style.borderRadius = '50%';
        box.appendChild(p);
    }
    setTimeout(() => box.innerHTML = '', 5500);
}

// ——— REPLAY ———
$('#btn-replay').addEventListener('click', () => {
    $('#confetti-container').innerHTML = '';
    capturedCanvas = null;
    positions = [];
    grabbedSlot = -1;
    selectedSlot = -1;

    // Reset checkbox
    const checkbox = $('.checkbox');
    const checkSvg = $('.checkmark-svg');
    checkbox.classList.remove('loading');
    checkSvg.classList.remove('visible');
    checkSvg.classList.add('hidden');

    showScreen('landing');
});

// ——— INIT ———
showScreen('landing');
