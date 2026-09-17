/* ============================
   FOTOĞRAF BULMACA OYUNU
   App Logic
   ============================ */

// ——— STATE ———
let gridSize = 4;
let positions = [];     // positions[i] = which piece index is at grid slot i
let selectedIndex = -1; // currently selected grid slot
let moveCount = 0;
let timerInterval = null;
let startTime = null;
let elapsedSeconds = 0;
let capturedImageCanvas = null;  // the full captured photo
let isPlaying = false;
const PUZZLE_CANVAS_SIZE = 480;  // internal canvas resolution

// ——— DOM REFS ———
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
    landing: $('#screen-landing'),
    camera: $('#screen-camera'),
    puzzle: $('#screen-puzzle'),
    congrats: $('#screen-congrats'),
};

const els = {
    btnStart: $('#btn-start'),
    btnCapture: $('#btn-capture'),
    btnReplay: $('#btn-replay'),
    webcam: $('#webcam'),
    countdownOverlay: $('#countdown-overlay'),
    countdownNumber: $('#countdown-number'),
    flashOverlay: $('#flash-overlay'),
    puzzleGrid: $('#puzzle-grid'),
    timerDisplay: $('#timer-display'),
    movesDisplay: $('#moves-display'),
    referenceImage: $('#reference-image'),
    captureCanvas: $('#capture-canvas'),
    completedImage: $('#completed-image'),
    finalTime: $('#final-time'),
    finalMoves: $('#final-moves'),
    difficultyOptions: $('#difficulty-options'),
    confettiContainer: $('#confetti-container'),
};

// ——— SCREEN MANAGEMENT ———
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// ——— DIFFICULTY SELECTION ———
els.difficultyOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.diff-btn');
    if (!btn) return;

    $$('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    gridSize = parseInt(btn.dataset.size);
});

// ——— START BUTTON ———
els.btnStart.addEventListener('click', async () => {
    showScreen('camera');
    await initCamera();
});

// ——— CAMERA ———
let stream = null;

async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 },
            }
        });
        els.webcam.srcObject = stream;
    } catch (err) {
        console.error('Kamera erişim hatası:', err);
        const wrapper = $('.camera-wrapper');
        const existing = wrapper.querySelector('.error-message');
        if (existing) existing.remove();

        const errDiv = document.createElement('div');
        errDiv.className = 'error-message';
        errDiv.textContent = '❌ Kameraya erişilemedi. Lütfen kamera iznini kontrol edin ve sayfayı yenileyin.';
        wrapper.appendChild(errDiv);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
}

// ——— CAPTURE BUTTON ———
els.btnCapture.addEventListener('click', () => {
    els.btnCapture.disabled = true;
    startCountdown();
});

// ——— COUNTDOWN ———
function startCountdown() {
    els.countdownOverlay.classList.remove('hidden');
    let count = 3;

    function showNumber() {
        if (count > 0) {
            els.countdownNumber.textContent = count;
            // Re-trigger animation
            els.countdownNumber.style.animation = 'none';
            void els.countdownNumber.offsetHeight; // force reflow
            els.countdownNumber.style.animation = 'countdownPulse 0.8s ease-out';

            count--;
            setTimeout(showNumber, 1000);
        } else {
            // Flash!
            els.countdownNumber.textContent = '📸';
            els.countdownNumber.style.animation = 'none';
            void els.countdownNumber.offsetHeight;
            els.countdownNumber.style.animation = 'countdownPulse 0.8s ease-out';

            setTimeout(() => {
                capturePhoto();
                els.countdownOverlay.classList.add('hidden');
                els.flashOverlay.classList.add('flash');
                setTimeout(() => els.flashOverlay.classList.remove('flash'), 400);

                // Transition to puzzle
                setTimeout(() => {
                    stopCamera();
                    createPuzzle();
                    showScreen('puzzle');
                    startTimer();
                    els.btnCapture.disabled = false;
                }, 500);
            }, 600);
        }
    }

    showNumber();
}

// ——— CAPTURE PHOTO ———
function capturePhoto() {
    const video = els.webcam;
    const canvas = els.captureCanvas;

    // Calculate center square crop
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    canvas.width = PUZZLE_CANVAS_SIZE;
    canvas.height = PUZZLE_CANVAS_SIZE;

    const ctx = canvas.getContext('2d');
    // Mirror horizontally to match the preview
    ctx.translate(PUZZLE_CANVAS_SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, PUZZLE_CANVAS_SIZE, PUZZLE_CANVAS_SIZE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Store reference
    capturedImageCanvas = canvas;

    // Draw reference thumbnail
    const ref = els.referenceImage;
    ref.width = 320;
    ref.height = 320;
    const refCtx = ref.getContext('2d');
    refCtx.drawImage(canvas, 0, 0, PUZZLE_CANVAS_SIZE, PUZZLE_CANVAS_SIZE, 0, 0, 320, 320);
}

// ——— CREATE PUZZLE ———
function createPuzzle() {
    isPlaying = true;
    moveCount = 0;
    selectedIndex = -1;
    els.movesDisplay.textContent = '0';

    // Create piece order [0, 1, 2, ... n*n-1]
    const total = gridSize * gridSize;
    positions = Array.from({ length: total }, (_, i) => i);

    // Shuffle
    shufflePositions();

    // Set grid template
    els.puzzleGrid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    els.puzzleGrid.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;

    renderPuzzle();
}

// ——— SHUFFLE (Fisher-Yates, ensure not already solved) ———
function shufflePositions() {
    const total = positions.length;
    do {
        for (let i = total - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [positions[i], positions[j]] = [positions[j], positions[i]];
        }
    } while (isSolved()); // Keep shuffling if accidentally solved
}

function isSolved() {
    return positions.every((p, i) => p === i);
}

// ——— RENDER PUZZLE ———
function renderPuzzle() {
    els.puzzleGrid.innerHTML = '';

    const pieceCanvasSize = PUZZLE_CANVAS_SIZE / gridSize;

    positions.forEach((pieceIndex, slotIndex) => {
        const piece = document.createElement('div');
        piece.className = 'puzzle-piece';
        piece.dataset.slot = slotIndex;
        piece.dataset.piece = pieceIndex;

        // Create canvas for this piece
        const canvas = document.createElement('canvas');
        canvas.width = pieceCanvasSize;
        canvas.height = pieceCanvasSize;

        const ctx = canvas.getContext('2d');
        const srcRow = Math.floor(pieceIndex / gridSize);
        const srcCol = pieceIndex % gridSize;

        ctx.drawImage(
            capturedImageCanvas,
            srcCol * pieceCanvasSize, srcRow * pieceCanvasSize,
            pieceCanvasSize, pieceCanvasSize,
            0, 0,
            pieceCanvasSize, pieceCanvasSize
        );

        piece.appendChild(canvas);

        // Mark if correct
        if (pieceIndex === slotIndex) {
            piece.classList.add('correct');
        }

        // Click to select/swap
        piece.addEventListener('click', () => handlePieceClick(slotIndex));

        els.puzzleGrid.appendChild(piece);
    });
}

// ——— PIECE CLICK HANDLER ———
function handlePieceClick(slotIndex) {
    if (!isPlaying) return;

    const pieces = $$('.puzzle-piece');

    if (selectedIndex === -1) {
        // Nothing selected yet — select this piece
        selectedIndex = slotIndex;
        pieces[slotIndex].classList.add('selected');
    } else if (selectedIndex === slotIndex) {
        // Clicked same piece — deselect
        pieces[slotIndex].classList.remove('selected');
        selectedIndex = -1;
    } else {
        // Swap the two pieces
        const a = selectedIndex;
        const b = slotIndex;

        // Swap in positions array
        [positions[a], positions[b]] = [positions[b], positions[a]];

        // Deselect
        pieces[a].classList.remove('selected');
        selectedIndex = -1;

        // Increment moves
        moveCount++;
        els.movesDisplay.textContent = moveCount;

        // Re-render with animation
        renderPuzzle();

        // Animate the swapped pieces
        const newPieces = $$('.puzzle-piece');
        newPieces[a].classList.add('swap-animate');
        newPieces[b].classList.add('swap-animate');
        setTimeout(() => {
            newPieces[a]?.classList.remove('swap-animate');
            newPieces[b]?.classList.remove('swap-animate');
        }, 300);

        // Check win
        if (isSolved()) {
            isPlaying = false;
            setTimeout(() => {
                stopTimer();
                showCongrats();
            }, 400);
        }
    }
}

// ——— TIMER ———
function startTimer() {
    elapsedSeconds = 0;
    els.timerDisplay.textContent = '00:00';
    startTime = performance.now();

    timerInterval = setInterval(() => {
        elapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
        els.timerDisplay.textContent = formatTime(elapsedSeconds);
    }, 250);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    // Final precise reading
    if (startTime) {
        elapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
    }
}

function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

// ——— CONGRATS ———
function showCongrats() {
    // Set final stats
    els.finalTime.textContent = formatTime(elapsedSeconds);
    els.finalMoves.textContent = moveCount;

    // Draw completed image
    const canvas = els.completedImage;
    canvas.width = 440;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(capturedImageCanvas, 0, 0, PUZZLE_CANVAS_SIZE, PUZZLE_CANVAS_SIZE, 0, 0, 440, 440);

    showScreen('congrats');
    launchConfetti();
}

// ——— CONFETTI ———
function launchConfetti() {
    const container = els.confettiContainer;
    container.innerHTML = '';

    const colors = [
        '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
        '#ff6b9d', '#c56cf0', '#00d4ff', '#7c3aed',
        '#f59e0b', '#10b981', '#ec4899'
    ];

    const shapeTypes = ['square', 'rect', 'circle'];

    for (let i = 0; i < 120; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';

        const color = colors[Math.floor(Math.random() * colors.length)];
        const shape = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
        const leftPos = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = Math.random() * 2 + 2.5;
        const size = Math.random() * 8 + 6;

        piece.style.left = leftPos + '%';
        piece.style.backgroundColor = color;
        piece.style.animationDelay = delay + 's';
        piece.style.animationDuration = duration + 's';
        piece.style.width = size + 'px';

        if (shape === 'rect') {
            piece.style.height = (size * 0.4) + 'px';
        } else if (shape === 'circle') {
            piece.style.height = size + 'px';
            piece.style.borderRadius = '50%';
        } else {
            piece.style.height = size + 'px';
        }

        container.appendChild(piece);
    }

    // Clean up after animation
    setTimeout(() => {
        container.innerHTML = '';
    }, 6000);
}

// ——— REPLAY ———
els.btnReplay.addEventListener('click', () => {
    // Reset state
    positions = [];
    selectedIndex = -1;
    moveCount = 0;
    elapsedSeconds = 0;
    isPlaying = false;
    capturedImageCanvas = null;
    els.puzzleGrid.innerHTML = '';
    els.confettiContainer.innerHTML = '';

    showScreen('landing');
});

// ——— INIT ———
showScreen('landing');
