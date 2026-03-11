require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { LiveChat } = require('youtube-chat');
const tmi = require('tmi.js');
const { KickConnection, Events } = require('kick-live-connector');
const path = require('path');
const cors = require('cors');

const axios = require('axios');

// Ultra-Resilience for Render: Comprehensive browser impersonation
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
axios.defaults.headers.common['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
axios.defaults.headers.common['Accept-Language'] = 'en-US,en;q=0.9';
axios.defaults.headers.common['Referer'] = 'https://www.youtube.com/';
axios.defaults.headers.common['sec-ch-ua'] = '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"';
axios.defaults.headers.common['sec-ch-ua-mobile'] = '?0';
axios.defaults.headers.common['sec-ch-ua-platform'] = '"Windows"';
axios.defaults.headers.common['sec-fetch-dest'] = 'document';
axios.defaults.headers.common['sec-fetch-mode'] = 'navigate';
axios.defaults.headers.common['sec-fetch-site'] = 'same-origin';
axios.defaults.headers.common['sec-fetch-user'] = '?1';
axios.defaults.headers.common['upgrade-insecure-requests'] = '1';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));

// Landing Page (Generator)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Actual Overlay Page
app.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Dashboard Page
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Map to store active chat collectors: sourceId -> { instance, platform, rooms: Set }
const activeSources = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join', (data) => {
        let sources = [];
        if (typeof data === 'string') {
            sources = data.split(',').map(s => {
                const [platform, id] = s.split(':');
                return { id, platform: platform || 'youtube' };
            });
        } else if (data && data.sources) {
            sources = data.sources;
        }

        if (sources.length === 0) return;

        const roomName = sources.map(s => s.id).sort().join('_');
        socket.join(roomName);

        sources.forEach(source => {
            initSource(source.id, source.platform, roomName);
        });
    });

    socket.on('disconnect', () => {
        cleanupSources();
    });
});

function initSource(sourceId, platform, roomName) {
    if (activeSources.has(sourceId)) {
        activeSources.get(sourceId).rooms.add(roomName);
        return;
    }

    const sourceData = { platform, rooms: new Set([roomName]), instance: null };
    activeSources.set(sourceId, sourceData);

    if (platform === 'youtube') {
        startYoutube(sourceId, sourceData);
    } else if (platform === 'twitch') {
        startTwitch(sourceId, sourceData);
    } else if (platform === 'kick') {
        startKick(sourceId, sourceData);
    }
}

function startKick(channelName, sourceData) {
    try {
        const kick = new KickConnection(channelName);
        sourceData.instance = kick;

        kick.on(Events.ChatMessage, (data) => {
            const msg = {
                id: data.id,
                platform: 'kick',
                sourceId: channelName,
                type: 'MESSAGE',
                author: {
                    name: data.sender.username,
                    avatar: data.sender.profile_pic || `https://api.dicebear.com/9.x/shapes/svg?seed=${data.sender.username}`,
                    isOwner: data.sender.id === kick.channelId, // Basic check, might need refine
                    isModerator: data.sender.identity.badges.some(b => b.type === 'moderator')
                },
                message: data.content,
                timestamp: Date.now()
            };
            sourceData.rooms.forEach(room => io.to(room).emit('message', msg));
        });

        kick.on('error', (err) => console.error(`Kick Error [${channelName}]:`, err));

        kick.connect().catch(err => console.error(`Kick Connect Failed [${channelName}]:`, err));
    } catch (err) {
        console.error("Kick Init Error:", err);
    }
}

function startYoutube(videoId, sourceData, attempt = 0) {
    try {
        // Increased interval (15s) with jitter to avoid Render IP rate-limiting
        const interval = 15000 + Math.floor(Math.random() * 3000);
        const liveChat = new LiveChat({ liveId: videoId }, interval); 
        sourceData.instance = liveChat;

        liveChat.on('chat', (chatItem) => {
            const msg = processYTMessage(chatItem, videoId);
            sourceData.rooms.forEach(room => io.to(room).emit('message', msg));
        });

        liveChat.on('error', (err) => {
            console.error(`YT Error [${videoId}]:`, err.message);
            
            // Notify clients about the error
            const isRateLimit = err.message.includes('429');
            const errorMsg = isRateLimit 
                ? "YouTube Rate Limit. Retrying in background..." 
                : `YouTube Error: ${err.message}`;
            
            sourceData.rooms.forEach(room => io.to(room).emit('system_error', errorMsg));

            // Handle 429 with persistent retry (no attempt limit for "idc how" working)
            if (isRateLimit) {
                const backoff = Math.min(Math.pow(2, attempt) * 10000, 60000); // Max 1 min wait
                const jitter = Math.floor(Math.random() * 5000);
                const delay = backoff + jitter;

                console.log(`Rate Limit! Retrying YT [${videoId}] in ${delay}ms (Prev attempts: ${attempt})`);
                
                // Clean up old instance before retrying
                if (sourceData.instance) {
                    try { sourceData.instance.stop(); } catch(e) {}
                }

                setTimeout(() => {
                    startYoutube(videoId, sourceData, attempt + 1);
                }, delay);
            }
        });

        liveChat.on('end', () => {
             console.log(`YT Stream Ended [${videoId}]`);
             activeSources.delete(videoId);
        });

        liveChat.start().catch(err => {
            console.error(`YT Start Failed [${videoId}]:`, err.message);
            sourceData.rooms.forEach(room => io.to(room).emit('system_error', `YT Failed to Start: ${err.message}`));
        });
    } catch (err) {
        console.error("YT Init Error:", err);
    }
}

function startTwitch(channel, sourceData) {
    const client = new tmi.Client({ channels: [channel] });
    sourceData.instance = client;

    client.on('message', (chan, tags, message, self) => {
        if (self) return;
        const msg = {
            id: tags.id,
            platform: 'twitch',
            sourceId: channel,
            type: 'MESSAGE',
            author: {
                name: tags['display-name'] || tags.username,
                avatar: `https://api.dicebear.com/9.x/shapes/svg?seed=${tags.username}`, // Updated to Dicebear 9.x
                badges: [], // Support badges later
                isOwner: tags.mod || tags.badges?.broadcaster === '1',
                isModerator: tags.mod
            },
            message: message,
            timestamp: Date.now()
        };
        sourceData.rooms.forEach(room => io.to(room).emit('message', msg));
    });

    client.connect().catch(err => console.error(`Twitch Start Failed [${channel}]:`, err));
}

function cleanupSources() {
    activeSources.forEach((data, id) => {
        let active = false;
        data.rooms.forEach(room => {
            if (io.sockets.adapter.rooms.get(room)?.size > 0) active = true;
            else data.rooms.delete(room);
        });

        if (!active) {
            console.log(`Stopping ${data.platform} for ${id}`);
            if (data.platform === 'youtube') data.instance.stop();
            if (data.platform === 'twitch') data.instance.disconnect();
            if (data.platform === 'kick') data.instance.disconnect();
            activeSources.delete(id);
        }
    });
}

function processYTMessage(item, sourceId) {
    const isSuperchat = !!item.amountConfig;
    return {
        id: item.id,
        platform: 'youtube',
        sourceId: sourceId,
        type: isSuperchat ? 'SUPERCHAT' : 'MESSAGE',
        author: {
            name: item.author.name,
            avatar: item.author.thumbnail.url,
            isOwner: item.author.badges?.some(b => b.title === 'Owner'),
            isModerator: item.author.badges?.some(b => b.title === 'Moderator'),
        },
        message: item.message?.map(m => {
            if (m.text) return m.text;
            if (m.emoji) return `<img class="yt-emoji" src="${m.emoji.image.thumbnails[0].url}" alt="emoji" loading="lazy">`;
            return '';
        }).join('') || '',
        amount: item.purchaseAmountText || null,
        timestamp: item.timestamp,
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
