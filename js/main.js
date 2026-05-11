/**
 * Chain Reaction - Main Controller
 * Handles UI, DOM manipulation, and game flow
 */
(function () {
    'use strict';

    const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
    const PLAYER_CLASSES = ['player-1', 'player-2', 'player-3', 'player-4'];

    // DOM Elements
    const startScreen = document.getElementById('start-screen');
    const gameScreen = document.getElementById('game-screen');
    const gridContainer = document.getElementById('grid-container');
    const playerInfoBar = document.getElementById('player-info-bar');
    const scoreboard = document.getElementById('scoreboard');
    const currentPlayerName = document.getElementById('current-player-name');
    const gameTimerDisplay = document.getElementById('game-timer-display');
    const turnTimerDisplay = document.getElementById('turn-timer-display');
    const pauseModal = document.getElementById('pause-modal');
    const gameoverModal = document.getElementById('gameover-modal');

    // Buttons
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const soundBtn = document.getElementById('sound-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const restartBtn = document.getElementById('restart-btn');
    const quitBtn = document.getElementById('quit-btn');
    const playAgainBtn = document.getElementById('play-again-btn');
    const menuBtn = document.getElementById('menu-btn');

    // Settings inputs
    const playerCountSelect = document.getElementById('player-count');
    const gridRowsSelect = document.getElementById('grid-rows');
    const gridColsSelect = document.getElementById('grid-cols');
    const turnTimeSelect = document.getElementById('turn-time');
    const gameTimeSelect = document.getElementById('game-time');

    let game = null;
    let cellElements = []; // 2D array of DOM elements

    // === Event Listeners ===
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', togglePause);
    soundBtn.addEventListener('click', toggleSound);
    resumeBtn.addEventListener('click', resumeGame);
    restartBtn.addEventListener('click', restartGame);
    quitBtn.addEventListener('click', quitToMenu);
    playAgainBtn.addEventListener('click', restartGame);
    menuBtn.addEventListener('click', quitToMenu);

    function startGame() {
        // Initialize sound on first user interaction
        soundManager.init();

        const config = {
            rows: parseInt(gridRowsSelect.value),
            cols: parseInt(gridColsSelect.value),
            playerCount: parseInt(playerCountSelect.value),
            turnTime: parseInt(turnTimeSelect.value),
            gameTime: parseInt(gameTimeSelect.value)
        };

        game = new ChainReactionGame(config);

        // Set up callbacks
        game.onCellUpdate = handleCellUpdate;
        game.onExplosion = handleExplosion;
        game.onChainReaction = handleChainReaction;
        game.onTurnChange = handleTurnChange;
        game.onGameOver = handleGameOver;
        game.onTimerUpdate = handleTimerUpdate;
        game.onScoreUpdate = handleScoreUpdate;
        game.onCapture = handleCapture;

        // Build UI
        buildGrid(config.rows, config.cols);
        buildPlayerInfo(config.playerCount);
        buildScoreboard(config.playerCount);
        updateCurrentPlayerDisplay(0);
        updateTimerDisplay('game', config.gameTime * 60);
        updateTimerDisplay('turn', config.turnTime);

        // Switch screens
        startScreen.classList.remove('active');
        gameScreen.classList.add('active');

        // Start timers
        game.startTimers();
    }

    function buildGrid(rows, cols) {
        gridContainer.innerHTML = '';
        cellElements = [];

        // Calculate cell size based on viewport
        const maxWidth = Math.min(window.innerWidth * 0.92, 600);
        const maxHeight = window.innerHeight * 0.5;
        const cellSizeW = Math.floor((maxWidth - (cols + 1) * 2 - 16) / cols);
        const cellSizeH = Math.floor((maxHeight - (rows + 1) * 2 - 16) / rows);
        const cellSize = Math.min(cellSizeW, cellSizeH, 52);

        gridContainer.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
        gridContainer.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
        gridContainer.style.setProperty('--cell-size', `${cellSize}px`);

        for (let r = 0; r < rows; r++) {
            cellElements[r] = [];
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.addEventListener('click', () => handleCellClick(r, c));
                gridContainer.appendChild(cell);
                cellElements[r][c] = cell;
            }
        }
    }

    function buildPlayerInfo(playerCount) {
        playerInfoBar.innerHTML = '';
        for (let i = 0; i < playerCount; i++) {
            const indicator = document.createElement('div');
            indicator.classList.add('player-indicator');
            indicator.id = `player-indicator-${i}`;
            indicator.style.color = `var(--${PLAYER_CLASSES[i].replace('-', '')}-color, var(--player${i + 1}-color))`;
            indicator.innerHTML = `
                <div class="player-dot" style="background: var(--player${i + 1}-color)"></div>
                <span>${PLAYER_NAMES[i]}</span>
                <span class="pieces-count" id="pieces-${i}">0</span>
            `;
            if (i === 0) indicator.classList.add('active');
            playerInfoBar.appendChild(indicator);
        }
    }

    function buildScoreboard(playerCount) {
        scoreboard.innerHTML = '';
        for (let i = 0; i < playerCount; i++) {
            const card = document.createElement('div');
            card.classList.add('score-card');
            card.innerHTML = `
                <div class="player-name" style="color: var(--player${i + 1}-color)">${PLAYER_NAMES[i]}</div>
                <div class="score-value" id="score-${i}">0</div>
            `;
            scoreboard.appendChild(card);
        }
    }

    // === Cell Click Handler ===
    function handleCellClick(row, col) {
        if (!game || game.isProcessing || game.isPaused || game.isGameOver) return;

        if (!game.isValidMove(row, col)) {
            soundManager.play('invalid');
            const cell = cellElements[row][col];
            cell.style.animation = 'none';
            cell.offsetHeight; // trigger reflow
            cell.style.animation = '';
            cell.classList.add('invalid-shake');
            setTimeout(() => cell.classList.remove('invalid-shake'), 300);
            return;
        }

        soundManager.play('place');
        game.placeOrb(row, col);
    }

    // === Game Callbacks ===
    function handleCellUpdate(row, col, cellData) {
        const cellEl = cellElements[row][col];
        renderCell(cellEl, cellData);
        updatePieceCounts();
    }

    function handleExplosion(row, col) {
        soundManager.play('explode');
        const cellEl = cellElements[row][col];
        cellEl.classList.add('exploding');
        setTimeout(() => cellEl.classList.remove('exploding'), 300);
    }

    function handleChainReaction(chainCount) {
        soundManager.play('chain');
    }

    function handleTurnChange(playerIndex) {
        updateCurrentPlayerDisplay(playerIndex);
        updatePlayerIndicators(playerIndex);
        updatePieceCounts();
    }

    function handleGameOver(winner, reason, scores) {
        const winnerText = document.getElementById('winner-text');
        const finalScores = document.getElementById('final-scores');
        const winReason = document.getElementById('win-reason');

        winnerText.textContent = `${PLAYER_NAMES[winner]} Wins!`;
        winnerText.style.color = `var(--player${winner + 1}-color)`;

        let reasonText = '';
        if (reason === 'domination') {
            reasonText = 'Victory by board domination!';
        } else if (reason === 'timer') {
            reasonText = 'Game time ran out. Most pieces wins!';
        }
        winReason.textContent = reasonText;

        finalScores.innerHTML = '';
        const sortedPlayers = [...Array(game.playerCount).keys()].sort((a, b) => scores[b] - scores[a]);
        for (const i of sortedPlayers) {
            const row = document.createElement('div');
            row.classList.add('final-score-row');
            row.innerHTML = `
                <span style="color: var(--player${i + 1}-color)">${PLAYER_NAMES[i]}</span>
                <span>${scores[i]} pts</span>
            `;
            finalScores.appendChild(row);
        }

        soundManager.play('win');
        gameoverModal.classList.add('active');
    }

    function handleTimerUpdate(type, seconds) {
        updateTimerDisplay(type, seconds);
        if (type === 'turn' && seconds <= 5 && seconds > 0) {
            soundManager.play('tick');
        }
    }

    function handleScoreUpdate(scores) {
        for (let i = 0; i < scores.length; i++) {
            const scoreEl = document.getElementById(`score-${i}`);
            if (scoreEl) scoreEl.textContent = scores[i];
        }
    }

    function handleCapture(playerIndex, count) {
        soundManager.play('capture');
        handleScoreUpdate(game.scores);
    }

    // === Render Functions ===
    function renderCell(cellEl, cellData) {
        cellEl.innerHTML = '';
        cellEl.className = 'cell';

        if (cellData.count === 0 || cellData.owner === null) {
            return;
        }

        // Add critical class if about to explode
        if (cellData.count === cellData.capacity - 1) {
            cellEl.classList.add('critical');
        }

        const orbsContainer = document.createElement('div');
        orbsContainer.classList.add('orbs-container');

        for (let i = 0; i < cellData.count; i++) {
            const orb = document.createElement('div');
            orb.classList.add('orb', PLAYER_CLASSES[cellData.owner]);
            // Stagger animation
            orb.style.animationDelay = `${i * 0.2}s`;
            orbsContainer.appendChild(orb);
        }

        cellEl.appendChild(orbsContainer);

        // Add receiving animation
        cellEl.classList.add('receiving');
        setTimeout(() => cellEl.classList.remove('receiving'), 300);
    }

    function updateCurrentPlayerDisplay(playerIndex) {
        currentPlayerName.textContent = `${PLAYER_NAMES[playerIndex]}'s Turn`;
        currentPlayerName.style.color = `var(--player${playerIndex + 1}-color)`;
    }

    function updatePlayerIndicators(activeIndex) {
        for (let i = 0; i < game.playerCount; i++) {
            const indicator = document.getElementById(`player-indicator-${i}`);
            if (!indicator) continue;
            indicator.classList.toggle('active', i === activeIndex);
            indicator.classList.toggle('eliminated', game.eliminated[i]);
        }
    }

    function updatePieceCounts() {
        if (!game) return;
        for (let i = 0; i < game.playerCount; i++) {
            const countEl = document.getElementById(`pieces-${i}`);
            if (countEl) countEl.textContent = game.pieceCounts[i];
        }
    }

    function updateTimerDisplay(type, seconds) {
        if (type === 'game') {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            gameTimerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            gameTimerDisplay.classList.toggle('warning', seconds <= 60);
        } else {
            turnTimerDisplay.textContent = seconds;
            turnTimerDisplay.classList.toggle('warning', seconds <= 5);
        }
    }

    // === Control Functions ===
    function togglePause() {
        if (!game) return;
        game.pause();
        pauseModal.classList.add('active');
    }

    function resumeGame() {
        if (!game) return;
        game.resume();
        pauseModal.classList.remove('active');
    }

    function toggleSound() {
        const enabled = soundManager.toggle();
        soundBtn.textContent = `Sound: ${enabled ? 'ON' : 'OFF'}`;
    }

    function restartGame() {
        if (game) game.destroy();
        pauseModal.classList.remove('active');
        gameoverModal.classList.remove('active');
        gameScreen.classList.remove('active');
        // Re-trigger start
        startGame();
    }

    function quitToMenu() {
        if (game) game.destroy();
        game = null;
        pauseModal.classList.remove('active');
        gameoverModal.classList.remove('active');
        gameScreen.classList.remove('active');
        startScreen.classList.add('active');
    }

    // === Handle window resize ===
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (game && !game.isGameOver) {
                // Recalculate cell sizes
                const maxWidth = Math.min(window.innerWidth * 0.92, 600);
                const maxHeight = window.innerHeight * 0.5;
                const cellSizeW = Math.floor((maxWidth - (game.cols + 1) * 2 - 16) / game.cols);
                const cellSizeH = Math.floor((maxHeight - (game.rows + 1) * 2 - 16) / game.rows);
                const cellSize = Math.min(cellSizeW, cellSizeH, 52);
                gridContainer.style.setProperty('--cell-size', `${cellSize}px`);
            }
        }, 200);
    });

})();
