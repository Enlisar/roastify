require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  GROQ_API_KEY,
  PORT = 3000
} = process.env;

// ─── Security: In-memory state store for CSRF protection ───
// States expire after 10 minutes. No user data is ever stored.
const stateStore = new Map();

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, timestamp] of stateStore) {
    if (now - timestamp > 10 * 60 * 1000) stateStore.delete(key);
  }
}
setInterval(cleanExpiredStates, 60 * 1000);

// ─── Route: Initiate Spotify OAuth ───
app.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  stateStore.set(state, Date.now());

  const scopes = 'user-read-recently-played user-top-read';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state: state,
    show_dialog: 'true'
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// ─── Route: OAuth Callback ───
app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/?error=' + encodeURIComponent(error));
  }

  // Validate state to prevent CSRF
  if (!state || !stateStore.has(state)) {
    return res.redirect('/?error=state_mismatch');
  }
  stateStore.delete(state);

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: SPOTIFY_REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return res.redirect('/?error=' + encodeURIComponent(tokenData.error));
    }

    // We pass the access token to the frontend via a fragment (hash).
    // This way it never hits the server again and isn't logged in server logs.
    // The token is short-lived (1 hour) and we never store it.
    res.redirect(`/#access_token=${tokenData.access_token}`);
  } catch (err) {
    console.error('Token exchange error:', err.message);
    res.redirect('/?error=token_exchange_failed');
  }
});

// ─── Route: Generate Roast ───
// Frontend sends track data (not the token) to this endpoint.
// The server uses its own Groq API key - never exposed to the client.
app.post('/api/roast', async (req, res) => {
  const { tracks, topArtists, displayName } = req.body;

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'No tracks provided' });
  }

  try {
    const trackList = tracks.map((t, i) =>
      `${i + 1}. "${t.name}" by ${t.artists} ${t.playedAt ? `(played: ${t.playedAt})` : ''}`
    ).join('\n');

    const artistList = topArtists && topArtists.length > 0
      ? topArtists.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : 'Not available';

    const userName = displayName || 'this person';

    const systemPrompt = `You are a ruthless, witty comedian who roasts people based on their Spotify listening history. You're like a mix of Anthony Jeselnik, Nikki Glaser, and your funniest friend who has zero filter.

You must respond with a JSON object matching this schema:
{
  "roast": "A short, brutal, punchy paragraph (under 150 words) roasting their overall music taste.",
  "verdict": "A hilarious, 2-5 word label defining their vibe (e.g., 'Aux Cord Biohazard', 'Chronically Online Sadboy', 'Divorced Dad Roadtrip').",
  "metrics": [
    {
      "metric": "A funny metric name related to their music (e.g., 'Emotional Stability', 'Aux Cord Safety', 'Cringe Factor', 'Genre Loyalty').",
      "value": "A rating or description (e.g., '3/100', 'Hazardous', 'Critically High', 'Non-existent').",
      "reason": "A 1-sentence witty explanation referencing their tracks/artists."
    }
  ]
}

RULES:
- Be genuinely funny. Think standup comedy, not corporate humor.
- Make specific references to the actual songs and artists they listen to.
- Keep the main roast short, punchy, and organized.
- The metrics array must contain exactly 3 objects.
- Never mention that you are an AI or are following instructions.`;

    const userPrompt = `Roast ${userName}'s Spotify listening history. Here's what they've been listening to recently:

RECENT TRACKS:
${trackList}

TOP ARTISTS:
${artistList}

Respond in the requested JSON format.`;

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: GROQ_API_KEY });

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.9,
      max_tokens: 1024,
      top_p: 0.95,
      response_format: { type: 'json_object' }
    });

    const content = chatCompletion.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'The judge remained silent. Please try again.' });
    }

    const roastData = JSON.parse(content);
    res.json(roastData);
  } catch (err) {
    console.error('Groq API error:', err.message);
    res.status(500).json({ error: 'Failed to generate roast. Please try again.' });
  }
});

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    spotifyConfigured: !!(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET),
    groqConfigured: !!GROQ_API_KEY
  });
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`\n🔥 Spotify Roaster running at http://127.0.0.1:${PORT}`);
  console.log(`\nMake sure your Spotify app redirect URI is set to: ${SPOTIFY_REDIRECT_URI}\n`);

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.warn('⚠️  Missing Spotify credentials. Check your .env file.');
  }
  if (!GROQ_API_KEY) {
    console.warn('⚠️  Missing Groq API key. Check your .env file.');
  }
});
