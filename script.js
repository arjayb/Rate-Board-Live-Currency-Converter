// Rate Board — a live currency converter.
// Data: Frankfurter (https://frankfurter.dev), free, no API key, ECB reference rates.
const API_BASE = 'https://api.frankfurter.dev/v1';

const amountInput = document.getElementById('amountInput');
const fromSelect = document.getElementById('fromSelect');
const toSelect = document.getElementById('toSelect');
const swapBtn = document.getElementById('swapBtn');
const flipDisplay = document.getElementById('flipDisplay');
const rateLine = document.getElementById('rateLine');
const updatedLine = document.getElementById('updatedLine');
const statusLine = document.getElementById('statusLine');
const tickerTrack = document.getElementById('tickerTrack');

const TICKER_PAIRS = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'CNY'];
const FALLBACK_CURRENCIES = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen',
  CAD: 'Canadian Dollar', AUD: 'Australian Dollar', CHF: 'Swiss Franc',
  CNY: 'Chinese Yuan', INR: 'Indian Rupee', SGD: 'Singapore Dollar'
};

let lastDisplayedValue = '';
let debounceTimer = null;
let convertToken = 0;

init();

async function init() {
  let currencies = FALLBACK_CURRENCIES;
  try {
    const res = await fetch(`${API_BASE}/currencies`);
    if (!res.ok) throw new Error('Bad response');
    currencies = await res.json();
  } catch (err) {
    setStatus('Using a limited currency list — live list unavailable right now.', true);
  }

  populateSelect(fromSelect, currencies, 'USD');
  populateSelect(toSelect, currencies, 'EUR');

  amountInput.addEventListener('input', onInputChanged);
  fromSelect.addEventListener('change', convert);
  toSelect.addEventListener('change', convert);
  swapBtn.addEventListener('click', () => {
    [fromSelect.value, toSelect.value] = [toSelect.value, fromSelect.value];
    convert();
  });

  convert();
  loadTicker();
  setInterval(loadTicker, 60_000);
}

function populateSelect(selectEl, currencies, preferred) {
  selectEl.innerHTML = '';
  Object.entries(currencies)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code} — ${name}`;
      selectEl.appendChild(opt);
    });
  if (currencies[preferred]) selectEl.value = preferred;
}

function onInputChanged() {
  // keep only digits and a single decimal point
  let v = amountInput.value.replace(/[^0-9.]/g, '');
  const firstDot = v.indexOf('.');
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
  }
  amountInput.value = v;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convert, 350);
}

async function convert() {
  const amount = parseFloat(amountInput.value);
  const from = fromSelect.value;
  const to = toSelect.value;

  if (!from || !to) return;

  if (!amount || amount < 0) {
    renderFlipValue('0.00');
    rateLine.textContent = '—';
    return;
  }

  const token = ++convertToken;
  setStatus('');

  try {
    const url = `${API_BASE}/latest?amount=${amount}&from=${from}&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Rate lookup failed');
    const data = await res.json();
    if (token !== convertToken) return; // a newer request has since started

    const converted = data.rates[to];
    if (converted === undefined) throw new Error('Currency not supported');

    renderFlipValue(formatNumber(converted));

    const unitRateRes = await fetch(`${API_BASE}/latest?amount=1&from=${from}&to=${to}`);
    const unitData = await unitRateRes.json();
    if (token !== convertToken) return;
    rateLine.textContent = `1 ${from} = ${formatNumber(unitData.rates[to], 4)} ${to}`;

    updatedLine.textContent = `Updated ${new Date().toLocaleTimeString()} · rates as of ${data.date}`;
  } catch (err) {
    if (token !== convertToken) return;
    setStatus("Couldn't reach the rate feed — check your connection and try again.");
  }
}

function formatNumber(n, decimals = 2) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function renderFlipValue(str) {
  if (str === lastDisplayedValue) return;
  const prev = lastDisplayedValue;
  lastDisplayedValue = str;

  flipDisplay.innerHTML = '';
  [...str].forEach((ch, i) => {
    const cell = document.createElement('div');
    const isDigit = /[0-9]/.test(ch);
    cell.className = isDigit ? 'flip-cell' : 'flip-cell symbol';

    const face = document.createElement('span');
    face.className = 'digit-face';
    face.textContent = ch;
    cell.appendChild(face);

    if (isDigit && prev[i] !== ch) {
      cell.classList.add('flipping');
    }
    flipDisplay.appendChild(cell);
  });
}

function setStatus(msg, info = false) {
  statusLine.textContent = msg;
  statusLine.classList.toggle('info', info);
}

async function loadTicker() {
  try {
    const res = await fetch(`${API_BASE}/latest?from=USD&to=${TICKER_PAIRS.join(',')}`);
    if (!res.ok) throw new Error('Ticker fetch failed');
    const data = await res.json();

    const items = Object.entries(data.rates).map(([code, rate]) => {
      return `<span class="ticker__item">USD/${code} <b>${formatNumber(rate, 4)}</b></span>`;
    });
    // duplicate the list so the marquee loops seamlessly
    tickerTrack.innerHTML = items.join('') + items.join('');
  } catch (err) {
    tickerTrack.innerHTML = '<span class="ticker__item">Live ticker unavailable right now.</span>';
  }
}
