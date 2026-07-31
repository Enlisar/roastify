# 🔥 Spotify Roaster

Get your Spotify music taste roasted by AI. Login with your Spotify account and let Groq-powered AI destroy your playlist choices.

## Setup

### 1. Create a Spotify App
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in:
   - **App Name**: Spotify Roaster (or whatever you want)
   - **App Description**: Anything
   - **Redirect URI**: `http://127.0.0.1:3000/callback`
   - **Which API/SDKs**: Select **Web API**
4. Click **Save**
5. Copy your **Client ID** and **Client Secret**

### 2. Get a Groq API Key
1. Go to [Groq Console](https://console.groq.com/keys)
2. Create a new API key
3. Copy it

### 3. Configure Environment Variables
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your credentials:
   ```
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
   GROQ_API_KEY=your_groq_api_key_here
   ```

### 4. Run
```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and click **Login with Spotify**.

## Security
- **No data storage**: Your Spotify data is never saved to disk or a database
- **Token handling**: Access tokens are extracted from URL hash fragments (never logged server-side), held in memory briefly, then discarded
- **CSRF protection**: OAuth state parameter with server-side validation
- **API keys server-side**: Groq API key never reaches the browser
- **Short-lived tokens**: Spotify access tokens expire in 1 hour and are not refreshed

## Tech Stack
- **Backend**: Node.js + Express
- **AI**: Groq (Llama 3.3 70B)
- **API**: Spotify Web API
- **Frontend**: Vanilla HTML/CSS/JS
