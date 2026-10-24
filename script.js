/**
 * ============================================================================
 * CALCORA - Modern Precision Calculator
 * ============================================================================
 * Features:
 *  - Safe, non-eval mathematical expression tokenizer & Shunting-Yard parser
 *  - Standard BODMAS / PEMDAS operator precedence & parentheses handling
 *  - Precise floating-point calculation without IEEE 754 precision artifacts
 *  - Calculation history with local storage persistence and quick recall
 *  - Light & Dark theme toggle with local storage persistence
 *  - Complete keyboard navigation & visual keypress feedback
 *  - Gentle Web Audio API click feedback with mute toggle
 *  - Copy result to clipboard with responsive toast feedback
 * ============================================================================
 */

// Wrap all logic in an IIFE (Immediately Invoked Function Expression) to prevent global scope leakage
(function () {
  'use strict';

  /* ==========================================================================
     1. MATHEMATICAL ENGINE (Safe, Non-eval, BODMAS/PEMDAS Compliant)
     ========================================================================== */

  /**
   * Cleans floating point arithmetic artifacts (e.g., 0.1 + 0.2 = 0.3 instead of 0.30000000000000004)
   * and prevents Infinity or NaN from escaping.
   * @param {number} num
   * @returns {number}
   */
  function cleanFloat(num) {
    if (!isFinite(num)) return num;
    // Round to 12 significant digits to eliminate floating point precision noise
    return parseFloat(num.toPrecision(12));
  }

  /**
   * Formats a number for presentation with localized thousands separators,
   * while keeping decimals clean or falling back to scientific notation if too large.
   * @param {number|string} value
   * @returns {string}
   */
  function formatDisplayNumber(value) {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    if (!isFinite(num)) return 'Cannot divide by zero';

    const cleaned = cleanFloat(num);
    const absVal = Math.abs(cleaned);

    // Use scientific notation for very large or tiny non-zero numbers
    if (absVal >= 1e12 || (absVal > 0 && absVal < 1e-7)) {
      return cleaned.toExponential(6).replace(/\.?0+e/, 'e');
    }

    // Split into integer and decimal parts for formatting
    const parts = cleaned.toString().split('.');
    const integerWithCommas = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? `${integerWithCommas}.${parts[1]}` : integerWithCommas;
  }

  /**
   * Tokenizes a raw mathematical string into numbers, operators, parentheses, and percentages.
   * Handles multi-digit numbers, decimals, unary minuses, and normalized symbols.
   * @param {string} rawExpr
   * @returns {Array<{type: string, value: string|number}>}
   */
  function tokenize(rawExpr) {
    // Normalize operators to standard characters
    const expr = rawExpr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/\s+/g, '');

    const tokens = [];
    let i = 0;

    while (i < expr.length) {
      const char = expr[i];

      // 1. Numbers and Decimals
      if (/\d/.test(char) || (char === '.' && (i + 1 < expr.length && /\d/.test(expr[i + 1])))) {
        let numStr = '';
        while (i < expr.length && (/[\d.]/.test(expr[i]))) {
          numStr += expr[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // 2. Unary Minus vs Binary Subtraction
      if (char === '-') {
        const prevToken = tokens[tokens.length - 1];
        const isUnary = !prevToken || prevToken.type === 'OPERATOR' || (prevToken.type === 'PAREN' && prevToken.value === '(');

        if (isUnary) {
          tokens.push({ type: 'UNARY_MINUS', value: 'NEG' });
          i++;
          continue;
        } else {
          tokens.push({ type: 'OPERATOR', value: '-' });
          i++;
          continue;
        }
      }

      // 3. Binary Operators (+, *, /)
      if (['+', '*', '/'].includes(char)) {
        tokens.push({ type: 'OPERATOR', value: char });
        i++;
        continue;
      }

      // 4. Percentage operator
      if (char === '%') {
        tokens.push({ type: 'PERCENT', value: '%' });
        i++;
        continue;
      }

      // 5. Parentheses
      if (char === '(' || char === ')') {
        tokens.push({ type: 'PAREN', value: char });
        i++;
        continue;
      }

      // Skip any unknown character
      i++;
    }

    return tokens;
  }

  /**
   * Converts infix tokens into Reverse Polish Notation (RPN) using Dijkstra's Shunting-Yard Algorithm.
   * Enforces standard mathematical precedence (BODMAS / PEMDAS).
   * @param {Array} tokens
   * @returns {Array} RPN queue
   */
  function shuntingYard(tokens) {
    const outputQueue = [];
    const operatorStack = [];

    // Precedence and associativity rules
    const precedence = {
      'NEG': { prec: 4, assoc: 'right' },
      '%':   { prec: 4, assoc: 'left' },
      '*':   { prec: 3, assoc: 'left' },
      '/':   { prec: 3, assoc: 'left' },
      '+':   { prec: 2, assoc: 'left' },
      '-':   { prec: 2, assoc: 'left' },
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === 'NUMBER') {
        outputQueue.push(token);
      } else if (token.type === 'PERCENT') {
        // Postfix percentage has high precedence
        outputQueue.push(token);
      } else if (token.type === 'UNARY_MINUS' || token.type === 'OPERATOR') {
        const op1 = token.value;
        const op1Info = precedence[op1];

        while (operatorStack.length > 0) {
          const top = operatorStack[operatorStack.length - 1];
          if (top.type === 'PAREN' && top.value === '(') break;

          const op2Info = precedence[top.value];
          if (!op2Info) break;

          if (
            (op1Info.assoc === 'left' && op1Info.prec <= op2Info.prec) ||
            (op1Info.assoc === 'right' && op1Info.prec < op2Info.prec)
          ) {
            outputQueue.push(operatorStack.pop());
          } else {
            break;
          }
        }
        operatorStack.push(token);
      } else if (token.type === 'PAREN' && token.value === '(') {
        operatorStack.push(token);
      } else if (token.type === 'PAREN' && token.value === ')') {
        let foundOpen = false;
        while (operatorStack.length > 0) {
          const top = operatorStack.pop();
          if (top.type === 'PAREN' && top.value === '(') {
            foundOpen = true;
            break;
          }
          outputQueue.push(top);
        }
        if (!foundOpen) {
          throw new Error('Mismatched parentheses');
        }
      }
    }

    // Auto-balance remaining unclosed parentheses and flush operator stack
    while (operatorStack.length > 0) {
      const top = operatorStack.pop();
      if (top.type === 'PAREN' && top.value === '(') {
        // Silently auto-close unclosed open parentheses for user convenience
        continue;
      }
      outputQueue.push(top);
    }

    return outputQueue;
  }

  /**
   * Evaluates an RPN token list safely without eval() or Function().
   * @param {Array} rpn
   * @returns {number}
   */
  function evaluateRPN(rpn) {
    const stack = [];

    for (let i = 0; i < rpn.length; i++) {
      const token = rpn[i];

      if (token.type === 'NUMBER') {
        stack.push(token.value);
      } else if (token.type === 'UNARY_MINUS') {
        if (stack.length < 1) throw new Error('Invalid expression format');
        const a = stack.pop();
        stack.push(-a);
      } else if (token.type === 'PERCENT') {
        if (stack.length < 1) throw new Error('Invalid percentage format');
        const val = stack.pop();
        stack.push(val / 100);
      } else if (token.type === 'OPERATOR') {
        if (stack.length < 2) throw new Error('Incomplete expression');
        const b = stack.pop();
        const a = stack.pop();

        let res = 0;
        switch (token.value) {
          case '+':
            res = a + b;
            break;
          case '-':
            res = a - b;
            break;
          case '*':
            res = a * b;
            break;
          case '/':
            if (b === 0) {
              throw new Error('Cannot divide by zero');
            }
            res = a / b;
            break;
          default:
            throw new Error(`Unsupported operator: ${token.value}`);
        }
        stack.push(cleanFloat(res));
      }
    }

    if (stack.length !== 1) {
      throw new Error('Malformed calculation');
    }

    return cleanFloat(stack[0]);
  }

  /**
   * Safe public evaluation function.
   * @param {string} expression
   * @returns {{success: boolean, result?: number, formatted?: string, error?: string}}
   */
  function calculateExpression(expression) {
    if (!expression || !expression.trim()) {
      return { success: true, result: 0, formatted: '0' };
    }

    try {
      const tokens = tokenize(expression);
      if (tokens.length === 0) {
        return { success: true, result: 0, formatted: '0' };
      }
      const rpn = shuntingYard(tokens);
      const numericResult = evaluateRPN(rpn);

      if (!isFinite(numericResult)) {
        return { success: false, error: 'Cannot divide by zero' };
      }

      return {
        success: true,
        result: numericResult,
        formatted: formatDisplayNumber(numericResult)
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Invalid calculation'
      };
    }
  }


  /* ==========================================================================
     2. AUDIO SYNTHESIZER (Optional Tactile Sound FX via Web Audio API)
     ========================================================================== */

  let audioCtx = null;
  let soundEnabled = localStorage.getItem('calcora_sound') === 'true';

  function playKeyClickSound(isEquals = false) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
      }
      if (!audioCtx) return;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = isEquals ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(isEquals ? 587.33 : 440, audioCtx.currentTime); // D5 or A4
      osc.frequency.exponentialRampToValueAtTime(isEquals ? 880 : 320, audioCtx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch (_) {
      // Audio autoplay policy fallback - fail silently
    }
  }


  /* ==========================================================================
     3. CALCULATOR APPLICATION STATE
     ========================================================================== */

  const state = {
    expression: '',        // The current mathematical expression being constructed (e.g. "12 + 5 × 2")
    currentDisplay: '0',   // Current number or preview output in the primary display
    isEvaluated: false,    // True right after equals '=' is pressed
    lastResult: null,      // Last successfully evaluated number
    history: []            // Array of calculation records { id, expression, result, formattedTime }
  };


  /* ==========================================================================
     4. DOM ELEMENTS CACHE
     ========================================================================== */

  const dom = {
    body: document.body,
    html: document.documentElement,
    expressionDisplay: document.getElementById('expression-display'),
    resultDisplay: document.getElementById('result-display'),
    keypad: document.getElementById('calc-keypad'),
    historyPanel: document.getElementById('history-panel'),
    historyList: document.getElementById('history-list'),
    historyToggleBtn: document.getElementById('toggle-history-btn'),
    historyCloseBtn: document.getElementById('close-history-btn'),
    historyClearBtn: document.getElementById('clear-history-btn'),
    historyBadge: document.getElementById('history-badge'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeIconDark: document.getElementById('theme-icon-dark'),
    themeIconLight: document.getElementById('theme-icon-light'),
    soundToggleBtn: document.getElementById('sound-toggle-btn'),
    soundIconOn: document.getElementById('sound-icon-on'),
    soundIconOff: document.getElementById('sound-icon-off'),
    copyBtn: document.getElementById('copy-result-btn'),
    copyTooltip: document.getElementById('copy-tooltip')
  };


  /* ==========================================================================
     5. UI RENDERING & DISPLAY LOGIC
     ========================================================================== */

  /**
   * Updates the main calculator display and expression line.
   * Auto-adjusts font size to prevent overflow for large equations.
   */
  function updateDisplay(isError = false) {
    if (!dom.resultDisplay || !dom.expressionDisplay) return;

    dom.expressionDisplay.textContent = state.expression;

    // Scroll expression to the end if it overflows horizontally
    const exprWrapper = dom.expressionDisplay.parentElement;
    if (exprWrapper) {
      exprWrapper.scrollLeft = exprWrapper.scrollWidth;
    }

    if (isError) {
      dom.resultDisplay.textContent = state.currentDisplay;
      dom.resultDisplay.classList.add('error-text');
      dom.resultDisplay.classList.remove('size-sm', 'size-xs');
      return;
    }

    dom.resultDisplay.classList.remove('error-text');

    // Display formatted number
    const text = state.currentDisplay;
    dom.resultDisplay.textContent = text;

    // Dynamically adjust font size based on text length
    dom.resultDisplay.classList.remove('size-sm', 'size-xs');
    if (text.length > 15) {
      dom.resultDisplay.classList.add('size-xs');
    } else if (text.length > 10) {
      dom.resultDisplay.classList.add('size-sm');
    }
  }

  /**
   * Shows a friendly error message on the display with subtle animation.
   * @param {string} msg
   */
  function displayError(msg) {
    state.currentDisplay = msg;
    updateDisplay(true);
  }

  /**
   * Flash copy feedback tooltip.
   */
  function showCopyFeedback() {
    if (!dom.copyTooltip) return;
    dom.copyTooltip.classList.add('show');
    setTimeout(() => {
      dom.copyTooltip.classList.remove('show');
    }, 1500);
  }


  /* ==========================================================================
     6. CALCULATOR CORE ACTIONS
     ========================================================================== */

  /**
   * Appends a digit (0-9) to the current input.
   * @param {string} digit
   */
  function handleNumberInput(digit) {
    playKeyClickSound();

    // If an evaluation was just completed, start a fresh expression on digit press
    if (state.isEvaluated) {
      state.expression = '';
      state.currentDisplay = digit;
      state.isEvaluated = false;
      updateDisplay();
      return;
    }

    // Replace default "0" or error states
    if (state.currentDisplay === '0' || state.currentDisplay === 'Cannot divide by zero' || state.currentDisplay === 'Error') {
      state.currentDisplay = digit;
    } else {
      state.currentDisplay += digit;
    }

    // Auto-update live preview if in chained calculation
    updateDisplay();
  }

  /**
   * Appends decimal point, ensuring no consecutive or multiple decimals.
   */
  function handleDecimalInput() {
    playKeyClickSound();

    if (state.isEvaluated) {
      state.expression = '';
      state.currentDisplay = '0.';
      state.isEvaluated = false;
      updateDisplay();
      return;
    }

    // Prevent multiple decimals in the current number
    if (state.currentDisplay.includes('.')) {
      return;
    }

    state.currentDisplay += '.';
    updateDisplay();
  }

  /**
   * Handles binary operators (+, −, ×, ÷)
   * @param {string} opSymbol (e.g. '+', '−', '×', '÷')
   */
  function handleOperatorInput(opSymbol) {
    playKeyClickSound();

    // If display is currently showing an error, reset before proceeding
    if (state.currentDisplay === 'Cannot divide by zero' || state.currentDisplay === 'Error') {
      state.currentDisplay = '0';
    }

    // If continuing from a previously evaluated result
    if (state.isEvaluated) {
      state.expression = `${state.lastResult} ${opSymbol} `;
      state.currentDisplay = '0';
      state.isEvaluated = false;
      updateDisplay();
      return;
    }

    // If expression is currently empty or has pending input
    if (state.currentDisplay !== '0' || state.expression === '') {
      state.expression += `${state.currentDisplay} ${opSymbol} `;
      state.currentDisplay = '0';
      updateDisplay();
      return;
    }

    // If last token in expression was already an operator, replace it
    const trimmed = state.expression.trim();
    if (/[+−×÷]$/.test(trimmed)) {
      state.expression = trimmed.slice(0, -1).trim() + ` ${opSymbol} `;
      updateDisplay();
    } else {
      state.expression += ` ${opSymbol} `;
      updateDisplay();
    }
  }

  /**
   * Handles parentheses '(' and ')'
   * @param {'(' | ')'} paren
   */
  function handleParenthesis(paren) {
    playKeyClickSound();

    if (paren === '(') {
      if (state.isEvaluated) {
        state.expression = '(';
        state.currentDisplay = '0';
        state.isEvaluated = false;
      } else if (state.currentDisplay !== '0') {
        // Implicit multiplication e.g. 5( becomes 5 × (
        state.expression += `${state.currentDisplay} × (`;
        state.currentDisplay = '0';
      } else {
        state.expression += '(';
      }
    } else if (paren === ')') {
      // Close parenthesis
      if (state.currentDisplay !== '0') {
        state.expression += `${state.currentDisplay})`;
        state.currentDisplay = '0';
      } else {
        state.expression += ')';
      }
    }
    updateDisplay();
  }

  /**
   * Toggles positive/negative sign (+/-) of current number.
   */
  function handleNegate() {
    playKeyClickSound();

    if (state.currentDisplay === '0' || state.currentDisplay === 'Cannot divide by zero') {
      return;
    }

    if (state.currentDisplay.startsWith('-')) {
      state.currentDisplay = state.currentDisplay.slice(1);
    } else {
      state.currentDisplay = '-' + state.currentDisplay;
    }
    updateDisplay();
  }

  /**
   * Percentage calculation (%)
   * - If preceded by an operator and base number (e.g., 200 × 50% or 100 + 15%),
   *   computes the contextual percentage value.
   * - If standalone (e.g., 50%), converts to decimal 0.5.
   */
  function handlePercentage() {
    playKeyClickSound();

    const currentVal = parseFloat(state.currentDisplay);
    if (isNaN(currentVal)) return;

    // Check if there is an existing expression with a base number
    const match = state.expression.match(/(-?[\d.]+)\s*([+−×÷])\s*$/);
    if (match) {
      const baseNum = parseFloat(match[1]);
      const op = match[2];

      if (!isNaN(baseNum)) {
        if (op === '×' || op === '÷') {
          // e.g. 200 × 50% => 100
          const percentVal = cleanFloat((baseNum * currentVal) / 100);
          state.currentDisplay = percentVal.toString();
          updateDisplay();
          return;
        } else if (op === '+' || op === '−') {
          // e.g. 100 + 15% => 15 (so 100 + 15 = 115)
          const percentVal = cleanFloat((baseNum * currentVal) / 100);
          state.currentDisplay = percentVal.toString();
          updateDisplay();
          return;
        }
      }
    }

    // Standalone fallback: 50% => 0.5
    const percentVal = cleanFloat(currentVal / 100);
    state.currentDisplay = percentVal.toString();
    updateDisplay();
  }

  /**
   * Backspace/Delete (DEL)
   */
  function handleDelete() {
    playKeyClickSound();

    if (state.isEvaluated) {
      state.expression = '';
      state.currentDisplay = '0';
      state.isEvaluated = false;
      updateDisplay();
      return;
    }

    if (state.currentDisplay.length > 1 && state.currentDisplay !== '0') {
      state.currentDisplay = state.currentDisplay.slice(0, -1);
      if (state.currentDisplay === '-' || state.currentDisplay === '') {
        state.currentDisplay = '0';
      }
    } else if (state.expression.length > 0) {
      // If current display is 0, delete from expression line
      state.expression = state.expression.trimEnd().slice(0, -1).trimEnd();
    } else {
      state.currentDisplay = '0';
    }

    updateDisplay();
  }

  /**
   * Clear All (AC)
   */
  function handleClearAll() {
    playKeyClickSound();
    state.expression = '';
    state.currentDisplay = '0';
    state.isEvaluated = false;
    updateDisplay();
  }

  /**
   * Evaluates the full mathematical expression (=)
   */
  function handleEquals() {
    playKeyClickSound(true);

    let fullExpr = state.expression;

    // Append current displayed number if not already empty/zero or if expression has pending operator
    if (state.currentDisplay !== '0' || fullExpr === '') {
      fullExpr += state.currentDisplay;
    } else {
      // Remove trailing hanging operators if any (e.g. "12 + ")
      fullExpr = fullExpr.trim();
      if (/[+−×÷]$/.test(fullExpr)) {
        fullExpr = fullExpr.slice(0, -1).trim();
      }
    }

    if (!fullExpr || fullExpr.trim() === '') {
      return;
    }

    const calcResult = calculateExpression(fullExpr);

    if (!calcResult.success) {
      displayError(calcResult.error || 'Error');
      state.isEvaluated = true;
      return;
    }

    // Successful calculation!
    const resultValue = calcResult.result;
    const formattedResult = calcResult.formatted;

    // Save to history
    addHistoryItem(fullExpr, formattedResult, resultValue);

    // Update state
    state.expression = `${fullExpr} =`;
    state.currentDisplay = formattedResult;
    state.lastResult = resultValue;
    state.isEvaluated = true;

    updateDisplay();
  }


  /* ==========================================================================
     7. CALCULATION HISTORY
     ========================================================================== */

  /**
   * Loads history from localStorage.
   */
  function loadHistory() {
    try {
      const stored = localStorage.getItem('calcora_history');
      if (stored) {
        state.history = JSON.parse(stored);
      }
    } catch (_) {
      state.history = [];
    }
    renderHistory();
  }

  /**
   * Saves history to localStorage.
   */
  function saveHistory() {
    try {
      localStorage.setItem('calcora_history', JSON.stringify(state.history.slice(0, 30)));
    } catch (_) {
      // LocalStorage quota or privacy mode - ignore
    }
  }

  /**
   * Adds an entry to history.
   */
  function addHistoryItem(expression, formattedResult, rawResult) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const item = {
      id: Date.now().toString(),
      expression,
      formattedResult,
      rawResult,
      time
    };

    // Prepend new item
    state.history.unshift(item);

    // Keep up to 30 items
    if (state.history.length > 30) {
      state.history.pop();
    }

    saveHistory();
    renderHistory();
  }

  /**
   * Clears calculation history.
   */
  function clearHistory() {
    state.history = [];
    saveHistory();
    renderHistory();
  }

  /**
   * Renders calculation history list.
   */
  function renderHistory() {
    if (!dom.historyList) return;

    // Update badge count
    if (dom.historyBadge) {
      if (state.history.length > 0) {
        dom.historyBadge.textContent = state.history.length > 9 ? '9+' : state.history.length;
        dom.historyBadge.classList.remove('hidden');
      } else {
        dom.historyBadge.classList.add('hidden');
      }
    }

    if (state.history.length === 0) {
      dom.historyList.innerHTML = `
        <div class="history-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <p>No calculations yet. Enter an equation and press =.</p>
        </div>
      `;
      return;
    }

    dom.historyList.innerHTML = '';
    state.history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-item';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Use result ${item.formattedResult} from ${item.expression}`);

      card.innerHTML = `
        <div class="history-expr">${escapeHtml(item.expression)}</div>
        <div class="history-res">= ${escapeHtml(item.formattedResult)}</div>
        <div class="history-meta">
          <span>${item.time}</span>
          <span class="history-reuse-hint">Tap to recall</span>
        </div>
      `;

      // Clicking recalls result into the calculator
      card.addEventListener('click', () => {
        playKeyClickSound();
        state.expression = '';
        state.currentDisplay = String(item.rawResult);
        state.lastResult = item.rawResult;
        state.isEvaluated = true;
        updateDisplay();
        // On mobile viewports, optionally collapse drawer
        if (window.innerWidth < 820 && dom.historyPanel) {
          dom.historyPanel.classList.add('collapsed');
        }
      });

      // Keyboard accessibility
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });

      dom.historyList.appendChild(card);
    });
  }

  /**
   * Escapes HTML string to prevent XSS.
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  /* ==========================================================================
     8. THEME & SETTINGS
     ========================================================================== */

  function initTheme() {
    const savedTheme = localStorage.getItem('calcora_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const activeTheme = savedTheme || (prefersDark ? 'dark' : 'light');

    applyTheme(activeTheme);
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      dom.html.setAttribute('data-theme', 'dark');
      if (dom.themeIconDark) dom.themeIconDark.style.display = 'none';
      if (dom.themeIconLight) dom.themeIconLight.style.display = 'block';
    } else {
      dom.html.removeAttribute('data-theme');
      if (dom.themeIconDark) dom.themeIconDark.style.display = 'block';
      if (dom.themeIconLight) dom.themeIconLight.style.display = 'none';
    }
    localStorage.setItem('calcora_theme', theme);
  }

  function toggleTheme() {
    const currentTheme = dom.html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  }

  function initSoundSetting() {
    updateSoundIcons();
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('calcora_sound', String(soundEnabled));
    updateSoundIcons();
    if (soundEnabled) playKeyClickSound();
  }

  function updateSoundIcons() {
    if (dom.soundIconOn && dom.soundIconOff) {
      dom.soundIconOn.style.display = soundEnabled ? 'block' : 'none';
      dom.soundIconOff.style.display = soundEnabled ? 'none' : 'block';
    }
  }


  /* ==========================================================================
     9. EVENT LISTENERS (Buttons, Keypad, Keyboard, Clipboard)
     ========================================================================== */

  function attachEventListeners() {
    // Keypad button clicks
    if (dom.keypad) {
      dom.keypad.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('.btn');
        if (!targetBtn) return;

        const action = targetBtn.dataset.action;
        const val = targetBtn.dataset.value;

        // Visual press effect
        targetBtn.classList.add('pressed');
        setTimeout(() => targetBtn.classList.remove('pressed'), 120);

        switch (action) {
          case 'number':
            handleNumberInput(val);
            break;
          case 'decimal':
            handleDecimalInput();
            break;
          case 'operator':
            handleOperatorInput(val);
            break;
          case 'paren-open':
            handleParenthesis('(');
            break;
          case 'paren-close':
            handleParenthesis(')');
            break;
          case 'negate':
            handleNegate();
            break;
          case 'percent':
            handlePercentage();
            break;
          case 'delete':
            handleDelete();
            break;
          case 'clear':
            handleClearAll();
            break;
          case 'equals':
            handleEquals();
            break;
        }
      });
    }

    // Physical Keyboard Support
    window.addEventListener('keydown', (e) => {
      // Don't intercept when user is typing in form fields (if any exist)
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const key = e.key;

      // Numbers 0 - 9
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        triggerButtonVisual(`[data-action="number"][data-value="${key}"]`);
        handleNumberInput(key);
        return;
      }

      // Decimal
      if (key === '.' || key === ',') {
        e.preventDefault();
        triggerButtonVisual('[data-action="decimal"]');
        handleDecimalInput();
        return;
      }

      // Operators
      if (key === '+') {
        e.preventDefault();
        triggerButtonVisual('[data-action="operator"][data-value="+"]');
        handleOperatorInput('+');
        return;
      }
      if (key === '-' || key === '−') {
        e.preventDefault();
        triggerButtonVisual('[data-action="operator"][data-value="−"]');
        handleOperatorInput('−');
        return;
      }
      if (key === '*' || key === 'x' || key === 'X') {
        e.preventDefault();
        triggerButtonVisual('[data-action="operator"][data-value="×"]');
        handleOperatorInput('×');
        return;
      }
      if (key === '/') {
        e.preventDefault();
        triggerButtonVisual('[data-action="operator"][data-value="÷"]');
        handleOperatorInput('÷');
        return;
      }

      // Parentheses
      if (key === '(') {
        e.preventDefault();
        triggerButtonVisual('[data-action="paren-open"]');
        handleParenthesis('(');
        return;
      }
      if (key === ')') {
        e.preventDefault();
        triggerButtonVisual('[data-action="paren-close"]');
        handleParenthesis(')');
        return;
      }

      // Percent
      if (key === '%') {
        e.preventDefault();
        triggerButtonVisual('[data-action="percent"]');
        handlePercentage();
        return;
      }

      // Equals / Enter
      if (key === 'Enter' || key === '=') {
        e.preventDefault();
        triggerButtonVisual('[data-action="equals"]');
        handleEquals();
        return;
      }

      // Backspace
      if (key === 'Backspace') {
        e.preventDefault();
        triggerButtonVisual('[data-action="delete"]');
        handleDelete();
        return;
      }

      // Escape / Clear
      if (key === 'Escape' || key.toLowerCase() === 'c') {
        e.preventDefault();
        triggerButtonVisual('[data-action="clear"]');
        handleClearAll();
        return;
      }
    });

    // Theme toggle
    if (dom.themeToggleBtn) {
      dom.themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Sound toggle
    if (dom.soundToggleBtn) {
      dom.soundToggleBtn.addEventListener('click', toggleSound);
    }

    // History drawer toggle
    if (dom.historyToggleBtn && dom.historyPanel) {
      dom.historyToggleBtn.addEventListener('click', () => {
        dom.historyPanel.classList.toggle('collapsed');
      });
    }

    // History close button (mobile)
    if (dom.historyCloseBtn && dom.historyPanel) {
      dom.historyCloseBtn.addEventListener('click', () => {
        dom.historyPanel.classList.add('collapsed');
      });
    }

    // Clear history button
    if (dom.historyClearBtn) {
      dom.historyClearBtn.addEventListener('click', clearHistory);
    }

    // Copy result to clipboard
    if (dom.copyBtn) {
      dom.copyBtn.addEventListener('click', copyCurrentResult);
    }
    if (dom.resultDisplay) {
      dom.resultDisplay.addEventListener('click', copyCurrentResult);
    }
  }

  /**
   * Helper to animate button when activated via physical keyboard.
   */
  function triggerButtonVisual(selector) {
    const btn = document.querySelector(selector);
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 120);
    }
  }

  /**
   * Copies active result to clipboard.
   */
  function copyCurrentResult() {
    const textToCopy = state.currentDisplay.replace(/,/g, '');
    if (!textToCopy || textToCopy === 'Cannot divide by zero' || textToCopy === 'Error') {
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(showCopyFeedback).catch(() => {
        fallbackCopyText(textToCopy);
      });
    } else {
      fallbackCopyText(textToCopy);
    }
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showCopyFeedback();
    } catch (_) {
      // Ignore copy error
    }
    document.body.removeChild(textarea);
  }


  /* ==========================================================================
     10. INITIALIZATION & SELF-TEST SUITE
     ========================================================================== */

  /**
   * Built-in Verification Suite to validate all user requirements
   */
  window.calcoraRunSelfTest = function () {
    const testCases = [
      { expr: '5 + 3', expected: 8 },
      { expr: '12 − 7', expected: 5 },
      { expr: '6 × 9', expected: 54 },
      { expr: '20 ÷ 4', expected: 5 },
      { expr: '2 + 3 × 4', expected: 14 },
      { expr: '(2 + 3) × 4', expected: 20 },
      { expr: '200 × 50%', expected: 100 },
      { expr: '50% × 200', expected: 100 },
      { expr: '0.1 + 0.2', expected: 0.3 },
      { expr: '20 ÷ 0', expectError: 'Cannot divide by zero' }
    ];

    console.group('🧪 Calcora Self-Test Suite');
    let passed = 0;

    testCases.forEach((t, i) => {
      const res = calculateExpression(t.expr);
      let ok = false;
      if (t.expectError) {
        ok = !res.success && res.error === t.expectError;
      } else {
        ok = res.success && Math.abs(res.result - t.expected) < 1e-10;
      }

      if (ok) {
        passed++;
        console.log(`%c✔ Test #${i + 1}: ${t.expr} = ${res.result || res.error}`, 'color: #10b981;');
      } else {
        console.error(`✖ Test #${i + 1} FAILED: ${t.expr}. Got:`, res, 'Expected:', t.expected || t.expectError);
      }
    });

    console.log(`Summary: ${passed}/${testCases.length} tests passed.`);
    console.groupEnd();
    return passed === testCases.length;
  };

  // Run on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSoundSetting();
    loadHistory();
    attachEventListeners();
    updateDisplay();

    // Run verification self-test in development console
    window.calcoraRunSelfTest();
  });

})();
