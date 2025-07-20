const gridSizes = [4, 5, 6, 7];
let currentGridSizeIndex = 0; // Start with 4x4
let gridSize = gridSizes[currentGridSizeIndex];
const difficulties = ['Easy', 'Medium', 'Hard'];
let currentDifficultyIndex = 0; // Start with Easy
const startStates = ['selected', 'unselected'];
let currentStartStateIndex = 1; // Start with All Unselected
let grid = [];
let rowSums = [];
let colSums = [];
let selected = [];
let active = []
let solutionSelected = []; // Store the correct solution
let pockets = [];
let pocketSums = [];
//let isLockCorrectEnabled = false; // Lock correct feature enabled by default
let score = 0; // Track number of solved puzzles
let isPuzzleSolved = false; // Prevent multiple increments for same puzzle
let timerInterval = null; // Store timer interval
let startTime = Date.now(); // Track puzzle start time

// Format time as MM:SS
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Update timer display
function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  document.getElementById('timer').textContent = formatTime(elapsed);
}

// Update grid sizeRF
function updateGridSize() {
  gridSize = gridSizes[currentGridSizeIndex];
  
  const gridElement = document.getElementById('grid');
  
  //gridElement.style.gridTemplateColumns = `minmax(0, 0.5fr) repeat(${gridSize}, minmax(0, 1fr))`;
  //gridElement.style.gridTemplateRows = `minmax(0, 0.5fr) repeat(${gridSize}, minmax(0, 1fr))`;
  gridElement.style.gridTemplateColumns = `repeat(${gridSize+1}, minmax(0, 1fr))`;
  gridElement.style.gridTemplateRows = `repeat(${gridSize+1}, minmax(0, 1fr))`;
  
  document.querySelector(`input[name="grid-size"][value="${currentGridSizeIndex}"]`).checked = true;
}


// Change grid size
function changeGridSize() {
  currentGridSizeIndex = parseInt(document.querySelector('input[name="grid-size"]:checked').value);
  updateGridSize();
  generateNewPuzzle();
}

// Change difficulty
function changeDifficulty() {
  currentDifficultyIndex = parseInt(document.querySelector('input[name="difficulty"]:checked').value);
  document.querySelector(`input[name="difficulty"][value="${currentDifficultyIndex}"]`).checked = true;
  generateNewPuzzle();
}

// Change start state
/*
function changeStartState() {
  currentStartStateIndex = parseInt(document.querySelector('input[name="start-state"]:checked').value);
  document.querySelector(`input[name="start-state"][value="${currentStartStateIndex}"]`).checked = true;
  generateNewPuzzle();
}*/

// Toggle lock correct feature
/*
function toggleLockCorrect() {
  isLockCorrectEnabled = !isLockCorrectEnabled;
  document.getElementById('lock-correct-btn').textContent = `Lock Correct: ${isLockCorrectEnabled ? 'On' : 'Off'}`;
  renderGrid(); // Re-render grid to apply or remove disabled/transparent classes
}*/

// Handle swipe and drag gestures
function setupGestures() {
  const groups = document.querySelectorAll('.radio-group');
  groups.forEach(group => {
    let startX = 0;
    let endX = 0;
    let isDragging = false;

    // Touch events for mobile
    group.addEventListener('touchstart', e => {
      startX = e.changedTouches[0].screenX;
      isDragging = true;
    });

    group.addEventListener('touchmove', e => {
      if (isDragging) {
        endX = e.changedTouches[0].screenX;
      }
    });

    group.addEventListener('touchend', () => {
      if (isDragging) {
        handleGesture(group, startX, endX);
        isDragging = false;
      }
    });

    // Mouse events for desktop
    group.addEventListener('mousedown', e => {
      startX = e.screenX;
      isDragging = true;
      e.preventDefault();
    });

    group.addEventListener('mousemove', e => {
      if (isDragging) {
        endX = e.screenX;
      }
    });

    group.addEventListener('mouseup', () => {
      if (isDragging) {
        handleGesture(group, startX, endX);
        isDragging = false;
      }
    });

    group.addEventListener('mouseleave', () => {
      if (isDragging) {
        handleGesture(group, startX, endX);
        isDragging = false;
      }
    });
  });

  function handleGesture(group, startX, endX) {
    const swipeDistance = endX - startX;
    const minSwipeDistance = 50; // Minimum distance for a swipe/drag
    const isGridGroup = group.classList.contains('grid-size-group');
    const isDifficultyGroup = group.classList.contains('difficulty-group');
    //const isStartStateGroup = group.classList.contains('start-state-group');
    const options = isGridGroup ? gridSizes : isDifficultyGroup ? difficulties : startStates;
    let currentIndex = isGridGroup ? currentGridSizeIndex : isDifficultyGroup ? currentDifficultyIndex : currentStartStateIndex;
    const radioName = isGridGroup ? 'grid-size' : isDifficultyGroup ? 'difficulty' : 'start-state';

    if (Math.abs(swipeDistance) > minSwipeDistance) {
      if (swipeDistance < 0) { // Swipe/drag left (next)
        currentIndex = Math.min(currentIndex + 1, options.length - 1);
      } else { // Swipe/drag right (previous)
        currentIndex = Math.max(currentIndex - 1, 0);
      }
      document.querySelector(`input[name="${radioName}"][value="${currentIndex}"]`).checked = true;
      if (isGridGroup) {
        currentGridSizeIndex = currentIndex;
        updateGridSize();
      } else if (isDifficultyGroup) {
        currentDifficultyIndex = currentIndex;
      } else {
        currentStartStateIndex = currentIndex;
      }
      generateNewPuzzle();
    }
  }
}

// Find first free cell scanning column by column, top to bottom
function findFirstFreeCell(usedCells) {
  for (let j = 0; j < gridSize; j++) {
    for (let i = 0; i < gridSize; i++) {
      if (!usedCells.has(`${i},${j}`)) {
        return [i, j];
      }
    }
  }
  return null; // No free cells
}

// Generate a pocket of N contiguous cells
function generatePocket(usedCells, maxRetries = 10) {
  if (maxRetries <= 0) return null; // Prevent infinite recursion
  const pocket = [];
  let startCell;
  // For first pocket, start at top-left; otherwise, find first free cell
  if (pockets.length === 0) {
    startCell = [0, 0];
  } else {
    startCell = findFirstFreeCell(usedCells);
    if (!startCell) return null; // No valid starting cell
  }
  const [startI, startJ] = startCell;
  pocket.push([startI, startJ]);
  usedCells.add(`${startI},${startJ}`);

  // Maintain a dynamic list of candidate cells adjacent to the pocket
  const candidates = new Set();
  const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  // Function to update candidates for a newly added cell
  function updateCandidates(i, j) {
    directions.forEach(([di, dj]) => {
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && ni < gridSize && nj >= 0 && nj < gridSize && !usedCells.has(`${ni},${nj}`)) {
        candidates.add(`${ni},${nj}`);
      }
    });
  }

  // Initialize candidates for the starting cell
  updateCandidates(startI, startJ);

  // Grow the pocket until it has gridSize cells
  while (pocket.length < gridSize && candidates.size > 0) {
    // Convert candidates to array and select one randomly
    const candidateArray = Array.from(candidates);
    const randomIndex = Math.floor(Math.random() * candidateArray.length);
    const [ni, nj] = candidateArray[randomIndex].split(',').map(Number);
    pocket.push([ni, nj]);
    usedCells.add(`${ni},${nj}`);
    candidates.delete(`${ni},${nj}`);
    updateCandidates(ni, nj);
  }

  // If pocket is too small, retry
  if (pocket.length < gridSize) {
    // Remove cells from usedCells to allow retry
    pocket.forEach(([i, j]) => usedCells.delete(`${i},${j}`));
    return generatePocket(usedCells, maxRetries - 1);
  }

  return pocket;
}

// Generate a new puzzle
function generatePuzzle() {
  // Initialize empty grid and selection
  grid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
  selected = Array(gridSize).fill().map(() => Array(gridSize).fill(true));
  active = Array(gridSize).fill().map(() => Array(gridSize).fill(true));
  pockets = [];
  pocketSums = [];

  // Determine selection range based on difficulty
  const maxSelect = gridSize - 1;
  const minSelect = difficulties[currentDifficultyIndex] === 'Easy' ? Math.ceil(maxSelect * 0.75) :
                    difficulties[currentDifficultyIndex] === 'Medium' ? Math.ceil(maxSelect * 0.5) : 1;

  // Step 1: For each row, select minSelect to maxSelect cells
  for (let i = 0; i < gridSize; i++) {
    const k = Math.floor(Math.random() * (maxSelect - minSelect + 1)) + minSelect;
    const indices = Array.from({ length: gridSize }, (_, j) => j);
    for (let j = gridSize - 1; j > 0; j--) {
      const m = Math.floor(Math.random() * (j + 1));
      [indices[j], indices[m]] = [indices[m], indices[j]];
    }
    for (let j = k; j < gridSize; j++) {
      selected[i][indices[j]] = false;
    }
  }

  // Step 2: For each column with all cells selected, select minSelect to maxSelect cells
  for (let j = 0; j < gridSize; j++) {
    const allSelected = selected.every(row => row[j]);
    if (allSelected) {
      const k = Math.floor(Math.random() * (maxSelect - minSelect + 1)) + minSelect;
      const indices = Array.from({ length: gridSize }, (_, i) => i);
      for (let i = gridSize - 1; i > 0; i--) {
        const m = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[m]] = [indices[m], indices[i]];
      }
      for (let i = k; i < gridSize; i++) {
        selected[indices[i]][j] = false;
      }
    }
  }

  // Step 3: Ensure at least one selected cell per row
  for (let i = 0; i < gridSize; i++) {
    const selectedCount = selected[i].reduce((count, val) => count + (val ? 1 : 0), 0);
    if (selectedCount === 0) {
      const j = Math.floor(Math.random() * gridSize);
      selected[i][j] = true;
    }
  }

  // Step 4: Ensure at least one selected cell per column
  for (let j = 0; j < gridSize; j++) {
    const selectedCount = selected.reduce((count, row) => count + (row[j] ? 1 : 0), 0);
    if (selectedCount === 0) {
      const i = Math.floor(Math.random() * gridSize);
      selected[i][j] = true;
    }
  }

  // Step 5: Generate N non-overlapping pockets
  const usedCells = new Set();
  for (let p = 0; p < gridSize; p++) {
    const pocket = generatePocket(usedCells);
    if (pocket) {
      pockets.push(pocket);
    } else {
      // If no valid pocket can be generated, restart puzzle generation
      generatePuzzle();
      return;
    }
  }

  // Step 6: Fill grid with random numbers (1-9)
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      grid[i][j] = Math.floor(Math.random() * 9) + 1;
    }
  }

  // Step 7: Ensure at least one selected cell per pocket
  pockets.forEach(pocket => {
    const selectedCount = pocket.reduce((count, [i, j]) => count + (selected[i][j] ? 1 : 0), 0);
    if (selectedCount === 0) {
      const [i, j] = pocket[Math.floor(Math.random() * pocket.length)];
      selected[i][j] = true;
    }
  });

  // Step 8: Calculate target sums
  rowSums = Array(gridSize).fill(0);
  colSums = Array(gridSize).fill(0);
  pocketSums = Array(gridSize).fill(0);
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (selected[i][j]) {
        rowSums[i] += grid[i][j];
        colSums[j] += grid[i][j];
        pockets.forEach((pocket, p) => {
          if (pocket.some(([pi, pj]) => pi === i && pj === j)) {
            pocketSums[p] += grid[i][j];
          }
        });
      }
    }
  }

  // Step 9: Store the correct solution
  solutionSelected = selected.map(row => [...row]);

  // Step 10: Set initial selection based on start state
  selected = Array(gridSize).fill().map(() => Array(gridSize).fill(startStates[currentStartStateIndex] === 'selected'));
}

// Find the top-leftmost cell in a pocket
function findTopLeftCell(pocket) {
  return pocket.reduce((topLeft, [i, j]) => {
    if (!topLeft || i < topLeft[0] || (i === topLeft[0] && j < topLeft[1])) {
      return [i, j];
    }
    return topLeft;
  }, null);
}

// Determine border styles for a cell in a pocket
function getPocketBorderStyles(i, j, pocketIndex) {
  const colors = ['red', 'blue', 'purple', 'orange', 'cyan', 'magenta', 'yellow'];
  const color = colors[pocketIndex % colors.length];
  const styles = [];
  const directions = [
    { di: -1, dj: 0, style: 'border-top' }, // Top
    { di: 0, dj: 1, style: 'border-right' }, // Right
    { di: 1, dj: 0, style: 'border-bottom' }, // Bottom
    { di: 0, dj: -1, style: 'border-left' } // Left
  ];

  directions.forEach(({ di, dj, style }) => {
    const ni = i + di, nj = j + dj;
    // Add border if cell is on grid edge or adjacent cell is not in the same pocket
    if (ni < 0 || ni >= gridSize || nj < 0 || nj >= gridSize ||
        !pockets[pocketIndex].some(([pi, pj]) => pi === ni && pj === nj)) {
      styles.push(`${style}: 0.5vw solid ${color}`);
    }
  });

  return styles.join('; ');
}

// Check if row selections match the solution
function isRowCorrect(i) {
  return selected[i].every((val, j) => val === solutionSelected[i][j]);
}

// Check if column selections match the solution
function isColCorrect(j) {
  return selected.every((row, i) => row[j] === solutionSelected[i][j]);
}

// Check if pocket selections match the solution
function isPocketCorrect(p) {
  return pockets[p].every(([i, j]) => selected[i][j] === solutionSelected[i][j]);
}

// Check if cell is in any correct pocket
function isCellInCorrectPocket(i, j) {
  return pockets.some((pocket, p) => isPocketCorrect(p) && pocket.some(([pi, pj]) => pi === i && pj === j));
}

// Render grid
function renderGrid() {
  const gridContainer = document.getElementById('grid');
  gridContainer.innerHTML = '';
  // Top row: column sums
  gridContainer.appendChild(createCell('', 'clue'));
  for (let j = 0; j < gridSize; j++) {
    const currentSum = calculateColSum(j);
    /*
    if (colSums[j] - currentSum < 0) {
      const sumCell = createCell(colSums[j], `clue incorrect`);
      gridContainer.appendChild(sumCell);
    } else {
      const sumCell = createCell(colSums[j] - currentSum, `clue ${isColCorrect(j) ? 'correct' : ''}`);
      gridContainer.appendChild(sumCell);
    }*/
    //sumCell.innerHTML += `<div class="sum ${isColCorrect(j) ? 'correct' : 'incorrect'}">(${currentSum})</div>`;
    //gridContainer.appendChild(sumCell);
    
    if (colSums[j] - currentSum < 0) {
      const sumCell = createCell(colSums[j], `clue incorrect`);
      gridContainer.appendChild(sumCell);
    } else if (colSums[j] - currentSum === 0) {      
      const sumCell = createCell('', `clue ${isColCorrect(j) ? 'correct' : 'incorrect'}`);
      gridContainer.appendChild(sumCell);
    } else {
      const sumCell = createCell(colSums[j] - currentSum, `clue`);
      gridContainer.appendChild(sumCell);
    }
  }
  // Main grid and row sums
  for (let i = 0; i < gridSize; i++) {
    const currentSum = calculateRowSum(i);
    if (rowSums[i] - currentSum < 0) {
      const rowSumCell = createCell(rowSums[i], `clue incorrect`);
      gridContainer.appendChild(rowSumCell);
    } else if (rowSums[i] - currentSum === 0) {
      const rowSumCell = createCell('', `clue ${isRowCorrect(i) ? 'correct' : 'incorrect'}`);
      gridContainer.appendChild(rowSumCell);
    } else {
      const rowSumCell = createCell(rowSums[i] - currentSum, `clue`);
      gridContainer.appendChild(rowSumCell);
    }
    //const rowSumCell = createCell(rowSums[i], `clue ${isRowCorrect(i) ? 'correct' : ''}`);
    //rowSumCell.innerHTML += `<div class="sum ${isRowCorrect(i) ? 'correct' : 'incorrect'}">(${currentSum})</div>`;
    //gridContainer.appendChild(rowSumCell);
    for (let j = 0; j < gridSize; j++) {
      let cellContent = grid[i][j];
      let cellClass = selected[i][j] ? 'cell active' :
                      active[i][j] ? 'cell deleted' : 'cell transparent';
      let cellStyle = '';

      // Apply disabled and transparent classes only if lock correct is enabled
      /*
      if (isLockCorrectEnabled) {
        const isDisabled = isRowCorrect(i) || isColCorrect(j) || isCellInCorrectPocket(i, j);
        if (isDisabled) {
          cellClass += ' disabled';
        }
        if (!selected[i][j] && isDisabled) {
          cellClass += ' transparent';
        }
      }*/

      // Check if this cell is the top-leftmost for any pocket
      pockets.forEach((pocket, p) => {
        const topLeft = findTopLeftCell(pocket);
        if (topLeft && topLeft[0] === i && topLeft[1] === j) {
          const currentSum = pocket.reduce((sum, [pi, pj]) => sum + (selected[pi][pj] ? grid[pi][pj] : 0), 0);
          cellContent = `${grid[i][j]}<div class="pocket-sum-${currentGridSizeIndex+4} ${isPocketCorrect(p) ? 'correct' : 'incorrect'}">(${pocketSums[p]} / ${currentSum})</div>`;
        }
      });

      // Apply contiguous borders for pocket cells
      pockets.forEach((pocket, p) => {
        if (pocket.some(([pi, pj]) => pi === i && pj === j)) {
          cellStyle = getPocketBorderStyles(i, j, p);
        }
      });

      const cell = createCell(cellContent, cellClass);
      if (cellStyle) cell.style.cssText = cellStyle;
      cell.addEventListener('click', () => toggleCell(i, j));
      cell.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggleCell(i, j);
      });      
      cell.addEventListener('dblclick', () => hideCell(i, j));
      gridContainer.appendChild(cell);
    }
  }

  // Check if the entire solution is correct
  let correct = true;
  for (let i = 0; i < gridSize; i++) {
    if (!isRowCorrect(i)) correct = false;
    if (!isColCorrect(i)) correct = false;
  }
  if (correct) {
    for (let p = 0; p < pockets.length; p++) {
      if (!isPocketCorrect(p)) correct = false;
    }
  }
  if (correct && !isPuzzleSolved) {
    score++;
    isPuzzleSolved = true;
    clearInterval(timerInterval); // Stop timer when solved
  }
  document.getElementById('score').textContent = `Score: ${score}`;
}

// Create a cell element
function createCell(content, className) {
  const div = document.createElement('div');
  div.className = className;
  div.innerHTML = content;
  return div;
}

// Toggle cell selection
function toggleCell(i, j) {
  // Skip toggling if lock correct is enabled and cell is in a correct row, column, or pocket
  //if (isLockCorrectEnabled && (isRowCorrect(i) || isColCorrect(j) || isCellInCorrectPocket(i, j))) {
  //  return;
  //}
  if (active[i][j] === false) {
    active[i][j] = true; // Reactivate cell if it was hidden
  }
  selected[i][j] = !selected[i][j];
  renderGrid();
}

// Hide cell (mark as deleted)
function hideCell(i, j) {
  if (active[i][j] === true) {
    active[i][j] = false;
    selected[i][j] = false;
  } else {
    active[i][j] = true; 
    selected[i][j] = false; 
  }

  renderGrid();
}

// Calculate row sum
function calculateRowSum(i) {
  return grid[i].reduce((sum, val, j) => sum + (selected[i][j] ? val : 0), 0);
}

// Calculate column sum
function calculateColSum(j) {
  return grid.reduce((sum, row, i) => sum + (selected[i][j] ? row[j] : 0), 0);
}

// Generate new puzzle and render
function generateNewPuzzle() {
  //isLockCorrectEnabled = false; // Reset to enabled on new puzzle
  //document.getElementById('lock-correct-btn').textContent = 'Lock Correct: On';
  isPuzzleSolved = false; // Allow score increment for new puzzle
  startTime = Date.now(); // Reset timer start
  clearInterval(timerInterval); // Clear existing timer
  document.getElementById('timer').textContent = '00:00'; // Reset timer display
  timerInterval = setInterval(updateTimer, 1000); // Start new timer
  generatePuzzle();
  renderGrid();
  // Update radio buttons to reflect current settings
  document.querySelector(`input[name="grid-size"][value="${currentGridSizeIndex}"]`).checked = true;
  document.querySelector(`input[name="difficulty"][value="${currentDifficultyIndex}"]`).checked = true;
  //document.querySelector(`input[name="start-state"][value="${currentStartStateIndex}"]`).checked = true;
}

// Initial setup
updateGridSize();
generateNewPuzzle();
setupGestures();