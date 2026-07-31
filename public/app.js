// ─── Spotify Roaster Frontend ───
// Security: Access token is only held in memory, never stored in localStorage/cookies.
// It's extracted from the URL hash fragment and cleared immediately.

const SPOTIFY_API = 'https://api.spotify.com/v1';

let accessToken = null;
let userData = null;
let tracksData = [];
let topArtistsData = [];

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  // Check for errors in URL params
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  if (error) {
    showError(decodeErrorMessage(error));
    // Clean URL
    window.history.replaceState({}, document.title, '/');
    return;
  }

  // Check for access token in hash fragment
  const hash = window.location.hash.substring(1);
  const hashParams = new URLSearchParams(hash);
  const token = hashParams.get('access_token');

  if (token) {
    accessToken = token;
    // Immediately clear the token from the URL bar for security
    window.history.replaceState({}, document.title, '/');
    startRoasting();
  }

  // Re-roast button
  document.getElementById('re-roast-btn').addEventListener('click', () => {
    if (tracksData.length > 0) {
      generateRoast();
    }
  });
});

function decodeErrorMessage(error) {
  const messages = {
    'access_denied': 'You denied access. No worries, your secrets are safe... for now.',
    'state_mismatch': 'Security check failed. Please try logging in again.',
    'token_exchange_failed': 'Failed to connect to Spotify. Please try again.'
  };
  return messages[error] || `Error: ${error}`;
}

// ─── Screen Management ───
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showScreen('error-screen');
}

function setLoadingText(text) {
  document.getElementById('loading-text').textContent = text;
}

// ─── Main Flow ───
async function startRoasting() {
  showScreen('loading-screen');
  setLoadingText('Fetching your questionable music taste...');

  try {
    // Fetch user profile, recent tracks, and top artists in parallel
    const [profileRes, recentRes, topArtistsRes] = await Promise.all([
      spotifyFetch('/me'),
      spotifyFetch('/me/player/recently-played?limit=50'),
      spotifyFetch('/me/top/artists?limit=20&time_range=medium_term')
    ]);

    if (!profileRes.ok || !recentRes.ok) {
      throw new Error('Failed to fetch Spotify data');
    }

    const profile = await profileRes.json();
    const recent = await recentRes.json();
    const topArtists = topArtistsRes.ok ? await topArtistsRes.json() : { items: [] };

    userData = profile;
    topArtistsData = topArtists.items?.map(a => a.name) || [];

    // Process tracks - deduplicate while preserving order
    const seen = new Set();
    tracksData = [];
    for (const item of (recent.items || [])) {
      const track = item.track;
      const key = `${track.name}-${track.artists.map(a => a.name).join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        tracksData.push({
          name: track.name,
          artists: track.artists.map(a => a.name).join(', '),
          album: track.album?.name,
          albumArt: track.album?.images?.[2]?.url || track.album?.images?.[0]?.url,
          playedAt: formatTime(item.played_at)
        });
      }
    }

    if (tracksData.length === 0) {
      throw new Error('No recently played tracks found. Go listen to some music first!');
    }

    // Clear access token from memory - we don't need it anymore
    accessToken = null;

    // Update UI with user info
    updateUserUI(profile);
    renderTrackChips(tracksData.slice(0, 10));

    // Generate roast
    await generateRoast();

  } catch (err) {
    console.error('Error:', err);
    accessToken = null; // Clear token on error too
    showError(err.message || 'Something went wrong. Please try again.');
  }
}

async function generateRoast() {
  showScreen('loading-screen');
  setLoadingText('Analyzing your track record... prepare to wince...');

  try {
    const response = await fetch('/api/roast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracks: tracksData,
        topArtists: topArtistsData,
        displayName: userData?.display_name || null
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate roast');
    }

    // Render roast with paragraph formatting
    const roastEl = document.getElementById('roast-content');
    roastEl.innerHTML = data.roast
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');

    // Render verdict
    document.getElementById('user-verdict').textContent = data.verdict || 'Suspicious';

    // Render metrics table
    const tableBodyEl = document.getElementById('metrics-table-body');
    if (data.metrics && Array.isArray(data.metrics)) {
      tableBodyEl.innerHTML = data.metrics.map(m => `
        <tr>
          <td>${escapeHtml(m.metric)}</td>
          <td>${escapeHtml(m.value)}</td>
          <td>${escapeHtml(m.reason)}</td>
        </tr>
      `).join('');
    } else {
      tableBodyEl.innerHTML = '<tr><td colspan="3">No records found. You got away clean.</td></tr>';
    }

    showScreen('roast-screen');

  } catch (err) {
    console.error('Roast error:', err);
    showError(err.message || 'Failed to generate roast. Please try again.');
  }
}

// ─── Spotify API Helper ───
function spotifyFetch(endpoint) {
  return fetch(SPOTIFY_API + endpoint, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}

// ─── UI Helpers ───
function updateUserUI(profile) {
  const avatar = profile.images?.[0]?.url;
  const avatarEl = document.getElementById('user-avatar');
  if (avatar) {
    avatarEl.src = avatar;
  } else {
    avatarEl.style.display = 'none';
  }
  document.getElementById('user-name').textContent = profile.display_name || 'Anonymous Listener';
}

function renderTrackChips(tracks) {
  const container = document.getElementById('tracks-preview');
  container.innerHTML = tracks.map(t => `
    <div class="track-chip">
      ${t.albumArt ? `<img src="${escapeAttr(t.albumArt)}" alt="" />` : ''}
      <div class="track-chip-info">
        <div class="track-chip-name">${escapeHtml(t.name)}</div>
        <div class="track-chip-artist">${escapeHtml(t.artists)}</div>
      </div>
    </div>
  `).join('');
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function logout() {
  accessToken = null;
  userData = null;
  tracksData = [];
  topArtistsData = [];
  window.location.href = '/';
}
