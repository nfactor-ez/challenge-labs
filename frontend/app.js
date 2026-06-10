const API_BASE = 'http://localhost:8081';
const challengeList = document.getElementById('challenge-list');
const terminalSection = document.getElementById('terminal-section');
const terminalName = document.getElementById('terminal-challenge-name');
const terminalStatus = document.getElementById('terminal-status');
const closeTerminalButton = document.getElementById('close-terminal');
const terminalContainer = document.getElementById('terminal');

const challenges = [
  {
    id: 1,
    title: 'Hello, Shell!',
    description: 'A filesystem scavenger hunt inside an Alpine container. Find a hidden flag using shell commands.',
    tags: ['shell', 'linux', 'beginner'],
    image: 'alpine'
  },
  {
    id: 2,
    title: 'SQL Injection 101',
    description: 'A vulnerable login service runs on port 8000. Bypass the auth and locate the flag.',
    tags: ['web', 'sqli', 'auth-bypass'],
    image: 'alpine'
  },
  {
    id: 3,
    title: 'Forensics Quick Win',
    description: 'Inspect the container filesystem and recover the secret token from hidden files.',
    tags: ['forensics', 'file-system', 'analysis'],
    image: 'alpine'
  }
];

let ws = null;
let term = null;
let fitAddon = null;
let activeSessionKey = null;

function createCard(challenge) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.challengeId = challenge.id;

  card.innerHTML = `
    <div>
      <h3>${challenge.title}</h3>
      <p>${challenge.description}</p>
    </div>
    <div class="tag-row">${challenge.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
    <button class="button button-primary">Launch terminal</button>
  `;

  const button = card.querySelector('button');
  button.addEventListener('click', () => startChallenge(challenge));
  return card;
}

function renderChallenges() {
  challengeList.innerHTML = '';
  for (const challenge of challenges) {
    challengeList.appendChild(createCard(challenge));
  }
}

async function startChallenge(challenge) {
  // mark selected card
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  const sel = document.querySelector(`.card[data-challenge-id='${challenge.id}']`);
  if (sel) sel.classList.add('selected');

  // ensure terminal panel visible on the right
  terminalSection.classList.remove('hidden');
  terminalName.textContent = challenge.title;
  terminalStatus.textContent = 'Starting container...';

  if (!term) {
    initializeTerminal();
  }

  term.clear();
  term.writeln(`Starting ${challenge.title}`);
  const image = challenge.image || 'alpine';

  try {
    const response = await fetch(`${API_BASE}/dev/sessions/start?image=${encodeURIComponent(image)}`, {
      method: 'POST'
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to start session');
    }

    activeSessionKey = result.session_key;
    terminalStatus.textContent = 'Connecting terminal...';
    term.writeln('Container ready. Connecting...');

    connectTerminal(activeSessionKey);
  } catch (error) {
    terminalStatus.textContent = 'Error starting terminal';
    term.writeln(`Error: ${error.message}`);
  }
}

function initializeTerminal() {
  term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    theme: {
      background: '#010506',
      foreground: '#baf3a1',
      cursor: '#8bff6d'
    }
  });
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalContainer);
  fitAddon.fit();

  term.onData(data => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });

  window.addEventListener('resize', () => fitAddon.fit());
}

function connectTerminal(sessionKey) {
  const wsProtocol = API_BASE.startsWith('https') ? 'wss' : 'ws';
  const url = `${wsProtocol}://${new URL(API_BASE).host}/ws/dev/terminal/${sessionKey}`;
  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    terminalStatus.textContent = 'Connected';
    fitAddon.fit();
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  });

  ws.addEventListener('message', event => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output') {
        term.write(msg.data);
      }
      if (msg.type === 'error') {
        term.writeln(`\r\nError: ${msg.error}`);
      }
    } catch (error) {
      term.writeln(`\r\nMalformed WS message: ${error.message}`);
    }
  });

  ws.addEventListener('close', () => {
    terminalStatus.textContent = 'Disconnected';
  });

  ws.addEventListener('error', () => {
    terminalStatus.textContent = 'Connection error';
  });
}

async function stopSession() {
  if (!activeSessionKey) {
    return;
  }

  terminalStatus.textContent = 'Stopping session...';

  try {
    await fetch(`${API_BASE}/dev/sessions/${activeSessionKey}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.warn('Failed to terminate session', error);
  }

  if (ws) {
    ws.close();
    ws = null;
  }

  terminalSection.classList.add('hidden');
  activeSessionKey = null;
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
}

closeTerminalButton.addEventListener('click', stopSession);
renderChallenges();
