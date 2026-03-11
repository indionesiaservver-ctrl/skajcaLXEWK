const socket = io();
const container = document.getElementById('chat-container');
const MAX_MESSAGES = 6; // Reduced to prevent "many chats" clutter
const HIDE_TIMEOUT = 15000; // Messages hide after 15 seconds

// Sound Elements
const sounds = {
    SUPERCHAT: document.getElementById('sound-superchat'),
    MEMBERSHIP: document.getElementById('sound-member')
};

// URL Params Implementation
const urlParams = new URLSearchParams(window.location.search);
let sources = [];

// Support legacy ?v=ID and new ?sources=platform:id,platform:id
const legacyId = extractVideoId(urlParams.get('v') || urlParams.get('video'));
const multiSources = urlParams.get('sources');

if (multiSources) {
    sources = multiSources.split(',').map(s => {
        const [platform, id] = s.includes(':') ? s.split(':') : ['youtube', s];
        return { id: extractVideoId(id), platform };
    });
} else if (legacyId) {
    sources = [{ id: legacyId, platform: 'youtube' }];
}

async function init() {
    if (sources.length === 0) {
        showError("MISSING VIDEO ID. Go to the home page to generate your link.");
    } else {
        showLoading(`Connecting ${sources.length} chat(s)...`);
        socket.emit('join', { sources });
    }
}

function extractVideoId(input) {
    if (!input) return null;
    if (input.length === 11) return input; // Already an ID
    
    // Support watch?v=ID, live/ID, and youtu.be/ID
    const patterns = [
        /(?:v=|\/live\/|\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match && match[1]) return match[1];
    }
    return input; // Fallback to raw if no match
}

init();

function showLoading(text) {
    if (document.getElementById('loading-indicator')) return;
    const div = document.createElement('div');
    div.id = 'loading-indicator';
    div.classList.add('message-item');
    div.style.background = 'rgba(0,0,0,0.5)';
    div.innerHTML = `<div class="text" style="color: #5e81f4; font-weight: bold;">${text}</div>`;
    container.appendChild(div);
}

socket.on('message', (msg) => {
    // Remove loading message if it exists
    const loading = document.getElementById('loading-indicator');
    if (loading) loading.remove();
    addMessage(msg);
});

socket.on('system_error', (err) => {
    showError(err);
});

socket.on('connect', () => {
    console.log("Connected to local server");
});

function addMessage(msg) {
    const div = document.createElement('div');
    div.classList.add('message-item');
    if (msg.type === 'SUPERCHAT') div.classList.add('superchat');
    
    // Play sound if applicable
    if (sounds[msg.type]) {
        sounds[msg.type].currentTime = 0;
        sounds[msg.type].play().catch(e => console.log("Sound play blocked:", e));
    }

    // Platform Icon
    const icons = {
        youtube: 'https://cdn.simpleicons.org/youtube/FF0000',
        twitch: 'https://cdn.simpleicons.org/twitch/9146FF',
        kick: 'https://cdn.simpleicons.org/kick/53FC18'
    };
    
    const platformIcon = `<img class="platform-icon platform-${msg.platform}" src="${icons[msg.platform] || icons.youtube}">`;

    let innerHTML = `
        <div class="avatar-container">
            <img class="avatar" src="${msg.author.avatar}" alt="${msg.author.name}">
            ${msg.author.isOwner ? '<span class="owner-badge">★</span>' : ''}
        </div>
        <div class="content">
            <div class="header">
                ${platformIcon}
                <span class="username">${msg.author.name}</span>
                <div class="badges">
                    ${msg.author.isOwner ? '<span class="badge badge-owner">Owner</span>' : ''}
                    ${msg.author.isModerator ? '<span class="badge badge-mod">MOD</span>' : ''}
                </div>
            </div>
    `;

    if (msg.type === 'SUPERCHAT') {
        innerHTML += `
            <span class="superchat-amount">Donated ${msg.amount}</span>
            <div class="text">${linkify(msg.message)}</div>
        `;
    } else {
        innerHTML += `<div class="text">${linkify(msg.message)}</div>`;
    }

    innerHTML += `</div>`;
    div.innerHTML = innerHTML;

    container.appendChild(div);

    // Auto-hide after timeout
    setTimeout(() => {
        if (div.parentNode) {
            div.classList.add('removing');
            setTimeout(() => div.remove(), 500);
        }
    }, HIDE_TIMEOUT);

    // Auto-remove old messages if over limit
    const messages = container.querySelectorAll('.message-item');
    if (messages.length > MAX_MESSAGES) {
        const oldest = messages[0];
        oldest.classList.add('removing');
        setTimeout(() => oldest.remove(), 500);
    }
}

function showError(text) {
    const div = document.createElement('div');
    div.style.background = 'rgba(255,0,0,0.2)';
    div.style.padding = '20px';
    div.style.borderRadius = '10px';
    div.style.border = '1px solid red';
    div.style.color = 'white';
    div.style.fontFamily = 'monospace';
    div.innerText = text;
    container.appendChild(div);
}

function linkify(text) {
    // This regex avoids matching URLs inside HTML attributes (like src="http...")
    const urlPattern = /(?<!src=")(?<!href=")(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlPattern, '<a href="$1" target="_blank" style="color: #5e81f4; text-decoration: underline;">$1</a>');
}
