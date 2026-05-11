/**
 * Chain Reaction Game - Core Logic
 */
class ChainReactionGame {
    constructor(config) {
        this.rows = config.rows;
        this.cols = config.cols;
        this.playerCount = config.playerCount;
        this.turnTimeLimit = config.turnTime; // seconds
        this.gameTimeLimit = config.gameTime * 60; // seconds

        // State
        this.grid = []; // grid[row][col] = { owner: playerIndex | null, count: 0 }
        this.currentPlayer = 0;
        this.scores = new Array(this.playerCount).fill(0);
        this.pieceCounts = new Array(this.playerCount).fill(0);
        this.eliminated = new Array(this.playerCount).fill(false);
        this.hasPlayed = new Array(this.playerCount).fill(false); // track first move
        this.turnNumber = 0;
        this.totalMoves = 0;
        this.isProcessing = false;
        this.isPaused = false;
        this.isGameOver = false;

        // Timers
        this.gameTimeRemaining = this.gameTimeLimit;
        this.turnTimeRemaining = this.turnTimeLimit;
        this.gameTimerInterval = null;
        this.turnTimerInterval = null;

        // Callbacks
        this.onCellUpdate = null;
        this.onExplosion = null;
        this.onChainReaction = null;
        this.onTurnChange = null;
        this.onGameOver = null;
        this.onTimerUpdate = null;
        this.onScoreUpdate = null;
        this.onCapture = null;

        this._initGrid();
    }

    _initGrid() {
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.grid[r][c] = {
                    owner: null,
                    count: 0,
                    capacity: this._getCapacity(r, c)
                };
            }
        }
    }

    _getCapacity(row, col) {
        let neighbors = 0;
        if (row > 0) neighbors++;
        if (row < this.rows - 1) neighbors++;
        if (col > 0) neighbors++;
        if (col < this.cols - 1) neighbors++;
        return neighbors;
    }

    _getNeighbors(row, col) {
        const neighbors = [];
        if (row > 0) neighbors.push({ row: row - 1, col });
        if (row < this.rows - 1) neighbors.push({ row: row + 1, col });
        if (col > 0) neighbors.push({ row, col: col - 1 });
        if (col < this.cols - 1) neighbors.push({ row, col: col + 1 });
        return neighbors;
    }

    startTimers() {
        this._startGameTimer();
        this._startTurnTimer();
    }

    _startGameTimer() {
        if (this.gameTimerInterval) clearInterval(this.gameTimerInterval);
        this.gameTimerInterval = setInterval(() => {
            if (this.isPaused || this.isGameOver || this.isProcessing) return;
            this.gameTimeRemaining--;
            if (this.onTimerUpdate) {
                this.onTimerUpdate('game', this.gameTimeRemaining);
            }
            if (this.gameTimeRemaining <= 0) {
                this._endGameByTimer();
            }
        }, 1000);
    }

    _startTurnTimer() {
        this.turnTimeRemaining = this.turnTimeLimit;
        if (this.turnTimerInterval) clearInterval(this.turnTimerInterval);
        this.turnTimerInterval = setInterval(() => {
            if (this.isPaused || this.isGameOver || this.isProcessing) return;
            this.turnTimeRemaining--;
            if (this.onTimerUpdate) {
                this.onTimerUpdate('turn', this.turnTimeRemaining);
            }
            if (this.turnTimeRemaining <= 0) {
                this._skipTurn();
            }
        }, 1000);
    }

    _resetTurnTimer() {
        this.turnTimeRemaining = this.turnTimeLimit;
        if (this.onTimerUpdate) {
            this.onTimerUpdate('turn', this.turnTimeRemaining);
        }
    }

    _skipTurn() {
        this._nextTurn();
    }

    _endGameByTimer() {
        this.isGameOver = true;
        this._stopTimers();
        // Winner is the player with most pieces on board
        let maxPieces = -1;
        let winner = -1;
        for (let i = 0; i < this.playerCount; i++) {
            if (!this.eliminated[i] && this.pieceCounts[i] > maxPieces) {
                maxPieces = this.pieceCounts[i];
                winner = i;
            }
        }
        if (this.onGameOver) {
            this.onGameOver(winner, 'timer', this.scores);
        }
    }

    _stopTimers() {
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }
        if (this.turnTimerInterval) {
            clearInterval(this.turnTimerInterval);
            this.turnTimerInterval = null;
        }
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    /**
     * Check if a move is valid for the current player
     */
    isValidMove(row, col) {
        if (this.isProcessing || this.isPaused || this.isGameOver) return false;
        if (this.eliminated[this.currentPlayer]) return false;
        const cell = this.grid[row][col];

        // First turn for each player: can place on any empty cell
        if (!this.hasPlayed[this.currentPlayer]) {
            return cell.owner === null;
        }

        // Subsequent turns: can only place on own cells
        return cell.owner === this.currentPlayer;
    }

    /**
     * Place a piece on the grid
     */
    async placeOrb(row, col) {
        if (!this.isValidMove(row, col)) return false;

        this.isProcessing = true;
        this.totalMoves++;
        this.turnNumber++;

        const cell = this.grid[row][col];

        // First turn: place (capacity - 1) orbs
        if (!this.hasPlayed[this.currentPlayer] && cell.owner === null) {
            const initialCount = cell.capacity - 1;
            cell.owner = this.currentPlayer;
            cell.count = initialCount;
            this.pieceCounts[this.currentPlayer] += initialCount;
            this.hasPlayed[this.currentPlayer] = true;

            if (this.onCellUpdate) {
                this.onCellUpdate(row, col, cell);
            }
        } else {
            // Add one orb
            cell.count++;
            this.pieceCounts[this.currentPlayer]++;

            if (this.onCellUpdate) {
                this.onCellUpdate(row, col, cell);
            }

            // Check for explosion
            if (cell.count >= cell.capacity) {
                await this._processExplosions(row, col);
            }
        }

        // Check win condition after processing
        if (!this.isGameOver) {
            this._checkWinCondition();
        }

        this.isProcessing = false;

        if (!this.isGameOver) {
            this._nextTurn();
        }

        return true;
    }

    /**
     * Process explosions with chain reactions
     */
    async _processExplosions(startRow, startCol) {
        let queue = [{ row: startRow, col: startCol }];
        let chainCount = 0;

        while (queue.length > 0) {
            const nextQueue = [];
            const nextQueueSet = new Set(); // prevent duplicates

            for (const { row, col } of queue) {
                const cell = this.grid[row][col];

                if (cell.count >= cell.capacity) {
                    chainCount++;
                    const explodingPlayer = cell.owner;

                    // Track captures for scoring
                    let capturedCount = 0;

                    // Explode: empty the cell
                    this.pieceCounts[explodingPlayer] -= cell.count;
                    cell.count = 0;
                    cell.owner = null;

                    if (this.onExplosion) {
                        this.onExplosion(row, col);
                    }

                    // Distribute to neighbors
                    const neighbors = this._getNeighbors(row, col);
                    for (const n of neighbors) {
                        const nCell = this.grid[n.row][n.col];

                        // Capture: if neighbor belongs to another player
                        if (nCell.owner !== null && nCell.owner !== explodingPlayer) {
                            capturedCount += nCell.count;
                            this.pieceCounts[nCell.owner] -= nCell.count;
                            nCell.owner = explodingPlayer;
                            // The existing orbs now belong to the exploding player
                            this.pieceCounts[explodingPlayer] += nCell.count;
                        }

                        // Add orb to neighbor
                        if (nCell.owner === null) {
                            nCell.owner = explodingPlayer;
                        }
                        nCell.count++;
                        this.pieceCounts[explodingPlayer]++;

                        if (this.onCellUpdate) {
                            this.onCellUpdate(n.row, n.col, nCell);
                        }

                        // Check if this neighbor now needs to explode
                        if (nCell.count >= nCell.capacity) {
                            const key = `${n.row},${n.col}`;
                            if (!nextQueueSet.has(key)) {
                                nextQueueSet.add(key);
                                nextQueue.push({ row: n.row, col: n.col });
                            }
                        }
                    }

                    // Update the exploded cell display
                    if (this.onCellUpdate) {
                        this.onCellUpdate(row, col, cell);
                    }

                    // Score for captures
                    if (capturedCount > 0) {
                        this.scores[explodingPlayer] += capturedCount * 10;
                        if (this.onCapture) {
                            this.onCapture(explodingPlayer, capturedCount);
                        }
                    }
                }
            }

            // Chain reaction bonus
            if (chainCount > 1 && nextQueue.length > 0) {
                this.scores[this.currentPlayer] += chainCount * 5;
                if (this.onChainReaction) {
                    this.onChainReaction(chainCount);
                }
            }

            queue = nextQueue;

            // Add delay for visual feedback
            if (queue.length > 0) {
                await this._delay(200);
            }

            // Check win condition during chain reactions
            if (this._checkWinDuringExplosion()) {
                break;
            }
        }

        // Bonus for chain length
        if (chainCount > 1) {
            this.scores[this.currentPlayer] += chainCount * 10;
            if (this.onScoreUpdate) {
                this.onScoreUpdate(this.scores);
            }
        }
    }

    _checkWinDuringExplosion() {
        // After the first round of moves (each player placed at least once)
        if (this.totalMoves <= this.playerCount) return false;

        let activePlayers = 0;
        let lastActive = -1;

        for (let i = 0; i < this.playerCount; i++) {
            if (this.pieceCounts[i] > 0) {
                activePlayers++;
                lastActive = i;
            }
        }

        if (activePlayers <= 1 && lastActive >= 0) {
            this.isGameOver = true;
            this._stopTimers();
            if (this.onGameOver) {
                this.onGameOver(lastActive, 'domination', this.scores);
            }
            return true;
        }
        return false;
    }

    _checkWinCondition() {
        if (this.totalMoves <= this.playerCount) return;

        // Check eliminated players
        for (let i = 0; i < this.playerCount; i++) {
            if (!this.eliminated[i] && this.pieceCounts[i] === 0 && this.totalMoves > this.playerCount) {
                this.eliminated[i] = true;
            }
        }

        let activePlayers = 0;
        let lastActive = -1;

        for (let i = 0; i < this.playerCount; i++) {
            if (!this.eliminated[i] && this.pieceCounts[i] > 0) {
                activePlayers++;
                lastActive = i;
            }
        }

        if (activePlayers <= 1 && lastActive >= 0) {
            this.isGameOver = true;
            this._stopTimers();
            soundManager.play('win');
            if (this.onGameOver) {
                this.onGameOver(lastActive, 'domination', this.scores);
            }
        }
    }

    _nextTurn() {
        // Move to next non-eliminated player
        let attempts = 0;
        do {
            this.currentPlayer = (this.currentPlayer + 1) % this.playerCount;
            attempts++;
        } while (this.eliminated[this.currentPlayer] && attempts < this.playerCount);

        this._resetTurnTimer();

        if (this.onTurnChange) {
            this.onTurnChange(this.currentPlayer);
        }
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    destroy() {
        this._stopTimers();
    }
}
