// DOM Elements
const homeScreen = document.getElementById('home-screen');
const gameUi = document.getElementById('game-ui');
const gameOverScreen = document.getElementById('game-over-screen');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const playBtn = document.getElementById('play-btn');
const retryBtn = document.getElementById('retry-btn');
const charBtns = document.querySelectorAll('.char-btn');

const scoreEl = document.getElementById('score');
const energyFillEl = document.getElementById('energy-fill');
const homeHighScoreEl = document.getElementById('home-high-score');
const goHighScoreEl = document.getElementById('go-high-score');
const finalScoreEl = document.getElementById('final-score');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let highScore = localStorage.getItem('gravityHighScore') || 0;
let gameSpeed = 5;
let baseSpeed = 5;
let animationId;
let frames = 0;

homeHighScoreEl.textContent = highScore;

// Player/Entity State
let selectedChar = 'male';
let energy = 100;
const MAX_ENERGY = 100;
const ENERGY_DRAIN = 30; // Drain per flip
const ENERGY_REGEN = 0.5; // Regen per frame

// Load character images
const maleImg = new Image();
maleImg.src = 'male.png';

const femaleImg = new Image();
femaleImg.src = 'female.png';

// Physics & Dimensions
const gravityForce = 0.6;
let isFlipped = false;

const player = {
    x: 100,
    y: 0, // will be set on init
    width: 45,
    height: 80,
    vy: 0,
    color: '#66fcf1' // Default male color
};

// Arrays
let obstacles = [];
let particles = [];

// Audio Context
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'flip') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'impact') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }
}

function vibrate(duration) {
    if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
}

// Character Selection
charBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        charBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedChar = btn.dataset.char;
        player.color = selectedChar === 'male' ? '#66fcf1' : '#f000ff';
    });
});

// Resize Canvas
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// Input Handling
function handleInput(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (gameState === 'START' && (e.type === 'keydown' || e.type === 'touchstart')) return; // handled by buttons
    if (gameState === 'GAMEOVER' && (e.type === 'keydown' || e.type === 'touchstart')) return;
    
    if (gameState === 'PLAYING') {
        e.preventDefault(); // Prevent scrolling on space
        flipGravity();
    }
}

window.addEventListener('keydown', handleInput);
canvas.addEventListener('touchstart', handleInput, {passive: false});
canvas.addEventListener('mousedown', handleInput);

function flipGravity() {
    if (energy >= ENERGY_DRAIN) {
        isFlipped = !isFlipped;
        player.vy = 0; // Reset velocity on flip for crisp turn
        energy -= ENERGY_DRAIN;
        playSound('flip');
        vibrate(30);
        createParticles(player.x + player.width/2, player.y + (isFlipped ? 0 : player.height), 10, player.color);
    }
}

// Game Loop Functions
function initGame() {
    initAudio();
    
    gameState = 'PLAYING';
    score = 0;
    gameSpeed = baseSpeed;
    frames = 0;
    energy = MAX_ENERGY;
    isFlipped = false;
    obstacles = [];
    particles = [];
    
    homeScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    gameUi.classList.add('active');
    
    resizeCanvas();
    player.y = canvas.height - player.height - 20; // 20 is ground margin
    player.vy = 0;
    
    updateUI();
    
    if (animationId) cancelAnimationFrame(animationId);
    gameLoop();
}

function updateUI() {
    scoreEl.textContent = Math.floor(score);
    energyFillEl.style.width = `${Math.max(0, Math.min(100, (energy / MAX_ENERGY) * 100))}%`;
    
    if (energy < ENERGY_DRAIN) {
        energyFillEl.style.backgroundColor = '#ff003c';
        energyFillEl.style.boxShadow = '0 0 10px #ff003c';
    } else {
        energyFillEl.style.backgroundColor = '#66fcf1';
        energyFillEl.style.boxShadow = '0 0 10px #66fcf1';
    }
}

function spawnObstacle() {
    // Generate an obstacle on ground or ceiling
    const isTop = Math.random() > 0.5;
    const width = 30 + Math.random() * 40;
    const height = 40 + Math.random() * 60;
    
    obstacles.push({
        x: canvas.width,
        y: isTop ? 20 : canvas.height - height - 20,
        width: width,
        height: height,
        passed: false,
        color: '#ff003c' // Error red for obstacles
    });
}

function spawnBirds() {
    const size = 20;
    // Top, Middle, Bottom
    const heights = [40, canvas.height / 2 - size / 2, canvas.height - 40 - size];
    
    heights.forEach((h, index) => {
        obstacles.push({
            x: canvas.width + index * 150, // stagger them horizontally so player can dodge
            y: h,
            width: size * 2,
            height: size,
            passed: false,
            color: '#f3e600', // Yellow neon for birds
            type: 'bird'
        });
    });
}

function update() {
    frames++;
    
    // Physics
    if (isFlipped) {
        player.vy -= gravityForce;
    } else {
        player.vy += gravityForce;
    }
    player.y += player.vy;
    
    // Boundaries
    const groundY = canvas.height - player.height - 20;
    const ceilingY = 20;
    
    if (player.y >= groundY) {
        player.y = groundY;
        player.vy = 0;
    } else if (player.y <= ceilingY) {
        player.y = ceilingY;
        player.vy = 0;
    }
    
    // Energy Regen
    if (energy < MAX_ENERGY) {
        energy += ENERGY_REGEN;
    }
    
    // Score & Speed
    score += 0.05; // Base score over time
    if (Math.floor(score) > 0 && Math.floor(score) % 50 === 0) {
        gameSpeed = baseSpeed + (Math.floor(score) / 50) * 0.5;
    }
    
    // Obstacles
    let spawnRate = Math.floor(120 - gameSpeed * 5);
    if (spawnRate < 20) spawnRate = 20; // Cap max spawn rate
    if (frames % spawnRate === 0) {
        spawnObstacle();
    }
    
    // Spawn 3 birds every 600 frames (~10 seconds)
    if (frames > 0 && frames % 600 === 0) {
        spawnBirds();
    }
    
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        
        if (obs.type === 'bird') {
            obs.x -= gameSpeed * 1.5; // birds fly faster
        } else {
            obs.x -= gameSpeed;
        }
        
        // Collision Detection
        if (player.x < obs.x + obs.width &&
            player.x + player.width > obs.x &&
            player.y < obs.y + obs.height &&
            player.y + player.height > obs.y) {
            
            gameOver();
        }
        
        if (!obs.passed && obs.x + obs.width < player.x) {
            obs.passed = true;
            score += 1; // bonus score for passing
        }
        
        if (obs.x + obs.width < 0) {
            obstacles.splice(i, 1);
        }
    }
    
    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
    
    updateUI();
}

function draw() {
    // Draw background gradient
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
    grad.addColorStop(0, '#1f2833');
    grad.addColorStop(1, '#0b0c10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw ground/ceiling lines
    ctx.strokeStyle = 'rgba(102, 252, 241, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(canvas.width, 20);
    ctx.moveTo(0, canvas.height - 20);
    ctx.lineTo(canvas.width, canvas.height - 20);
    ctx.stroke();
    
    // Draw obstacles
    obstacles.forEach(obs => {
        ctx.fillStyle = obs.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = obs.color;
        
        if (obs.type === 'bird') {
            // Draw a triangle for the bird
            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y + obs.height / 2); // left tip
            ctx.lineTo(obs.x + obs.width, obs.y); // top right
            ctx.lineTo(obs.x + obs.width, obs.y + obs.height); // bottom right
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        }
    });
    
    // Draw player
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'screen';
    
    ctx.save();
    
    // Flip character vertically if gravity is flipped
    if (isFlipped) {
        ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
        ctx.scale(1, -1);
        ctx.translate(-(player.x + player.width / 2), -(player.y + player.height / 2));
    }
    
    let currentImg = selectedChar === 'male' ? maleImg : femaleImg;
    
    // Draw a trail/glow based on energy before the player image
    ctx.globalAlpha = Math.max(0.3, energy/MAX_ENERGY);
    if (currentImg.complete) {
        ctx.drawImage(currentImg, player.x, player.y, player.width, player.height);
    } else {
        // Fallback if image isn't loaded yet
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }
    ctx.globalAlpha = 1.0;
    ctx.restore();
    
    ctx.globalCompositeOperation = 'source-over';
    
    // Draw particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
}

function gameLoop() {
    if (gameState !== 'PLAYING') return;
    
    update();
    draw();
    
    animationId = requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = 'GAMEOVER';
    playSound('impact');
    vibrate(200);
    
    createParticles(player.x + player.width/2, player.y + player.height/2, 50, player.color);
    
    // Draw final explosion before stopping
    draw();
    
    setTimeout(() => {
        gameUi.classList.remove('active');
        gameOverScreen.classList.add('active');
        
        finalScoreEl.textContent = Math.floor(score);
        
        if (Math.floor(score) > highScore) {
            highScore = Math.floor(score);
            localStorage.setItem('gravityHighScore', highScore);
        }
        goHighScoreEl.textContent = highScore;
        homeHighScoreEl.textContent = highScore;
    }, 500);
}

function createParticles(x, y, amount, color) {
    for (let i = 0; i < amount; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            radius: Math.random() * 3 + 1,
            life: Math.random() * 30 + 10,
            maxLife: 40,
            color: color
        });
    }
}

// Event Listeners
playBtn.addEventListener('click', initGame);
retryBtn.addEventListener('click', initGame);

// Initial setup
resizeCanvas();
