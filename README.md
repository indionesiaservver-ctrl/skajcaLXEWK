# YCOP | YouTube Chat Overlay Platform

A super-lightweight, premium glassmorphic chat overlay designed for OBS and ready for hosting on Render.

## 🚀 One-Click Deployment
This project is ready for **Render**. Just connect your GitHub repo and it will use the `render.yaml` file to set everything up.

> [!IMPORTANT]
> **Fixing Rate Limits (429 Errors) on Render:**
> Render's shared IPs are often blocked by YouTube. To fix this, you should provide a YouTube Session Cookie:
> 1. Open YouTube and log in.
> 2. Use a browser extension (like "EditThisCookie") to export your cookies in **JSON** format.
> 3. Add the entire JSON array as an Environment Variable named `YOUTUBE_COOKIE` in your Render Dashboard.
> 
> *Note: We support both raw header strings and JSON array formats.*

> [!NOTE]
> We have added a `start.js` file to ensure Render's default `node start` command works correctly alongside `npm start`.

## 🛠️ Local Setup
1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Open in OBS: `http://localhost:3000/?v=VIDEO_ID`

## 💎 Features
- **Glassmorphism**: Modern, translucent UI.
- **Dynamic Routing**: Use one deployment for many streams using `?v=ID`.
- **High Performance**: Vanilla JS/CSS for minimal CPU usage.
- **Sound Alerts**: Automated alerts for Superchats and Members.

## 📺 OBS Configuration
1. Add a **Browser Source**.
2. URL: `http://localhost:3000/?v=[YOUR_YOUTUBE_VIDEO_ID]`
3. Width/Height: `1920x1080` (or your preferred size).
4. Custom CSS: Clear it (the overlay handles its own styling).
5. **Tick "Refresh browser when source becomes active"**.
