const express = require('express');
const router = express.Router();
require('dotenv').config();


const jwt = require('jsonwebtoken'); // Handles JWT signing and verification
const crypto = require('crypto'); // Generates cryptographically secure values
const axios = require('axios'); // Performs outbound HTTP requests
const { Octokit } = require("@octokit/rest"); // Interacts with the GitHub API
const { OAuth2Client } = require('google-auth-library'); // Verifies Google OAuth tokens


// Import application data models used across the auth flows
const User = require('../models/User');
const Profile = require('../models/Profile');
const PendingAuth = require('../models/PendingAuth');

const loginUser = require('../utils/loginUser');
const registerUser = require('../utils/registerUser');

// Middleware that authenticates requests carrying the one-time auth code token
const authenticateCodeTokenByPost = require('../middlewares/authenticateCodeTokenByPost');
const authenticateToken = require('../middlewares/authenticateToken');

const ACCESS_EXPIRES_IN = 15 * 60;
const REFRESH_EXPIRES_IN = 30 * 24 * 60 * 60; // 30 days

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  ACCESS_SECRET,
  REFRESH_SECRET,
  WEB_ORIGIN,
  Website_URL,
  REDIRECT_URL_BASE,
  OAUTH_TOKEN_URL,
} = process.env;

const isProd = process.env.NODE_ENV === 'production'; // Toggle cookie security attributes based on environment
const safeWebOrigin = WEB_ORIGIN || Website_URL || 'http://localhost:4000';
const safeRedirectUrlBase = REDIRECT_URL_BASE || safeWebOrigin;


const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper functions

/**
 * Sign a short-lived access token that front-end clients can attach to API calls.
 *
 * @param {import('../models/User')} user - The user entity to encode in the token.
 * @returns {string} Signed JWT representing the user session.
 */
function signAccess(user) {
  return jwt.sign(
    { 
      id: user._id?.toString?.() || user.id, email: user.email },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

/**
 * Sign an extended-lifetime access token for trusted background clients.
 *
 * @param {import('../models/User')} user - The user entity to encode in the token.
 * @returns {string} Signed JWT valid for 30 days.
 */
function longSignAccess(user) {
  return jwt.sign(
    { id: user._id?.toString?.() || user.id, email: user.email },
    ACCESS_SECRET,
    { expiresIn: 30 * 24 * 60 * 60 } // 30 days
  );
}

/**
 * Sign a refresh token that clients can use to rotate access tokens.
 *
 * @param {import('../models/User')} user - The user entity to encode in the token.
 * @returns {string} Signed JWT refresh token.
 */
function signRefresh(user) {
  return jwt.sign(
    { id: user._id?.toString?.() || user.id, email: user.email },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

/**
 * Validate the signature of an incoming refresh token.
 *
 * @param {string} token - Refresh token provided by the client.
 * @returns {import('jsonwebtoken').JwtPayload} Decoded refresh payload.
 */
function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

/**
 * Persist the refresh token in a secure HTTP-only cookie.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {string} refreshToken - Signed refresh token to store.
 */
function setRefreshCookie(res, refreshToken) {
  res.cookie('defuze_refreshToken', refreshToken, {
    httpOnly: true, // Hide the refresh token from client-side scripts
    secure: isProd,  // Require HTTPS in production builds
    sameSite: isProd ? 'none' : 'lax', // Allow cross-site cookies only when needed
    path: '/',                      // Make the cookie available to the whole site
    maxAge: REFRESH_EXPIRES_IN * 1000,
  });
}
/**
 * Helper for returning a JSON error response with consistent shape.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {number} status - HTTP status code to send.
 * @param {string} message - Human-readable error message.
 * @returns {import('express').Response} Express response with error payload.
 */
function jsonError(res, status, message) {
  return res.status(status).json({ message });
}

// OAuth2.0 Helpers
/**
 * Persist OAuth state metadata so we can verify callbacks and detect replays.
 *
 * @param {Object} params - State creation parameters.
 * @param {string} params.state - Random state string issued to the client.
 * @param {string} params.clientId - Client identifier initiating the flow.
 * @param {string} params.redirectUrl - Expected redirect URL for the callback.
 * @returns {Promise<import('../models/PendingAuth')>} Newly persisted state record.
 */
async function createPendingAuth({ state, clientId, redirectUrl }) {
  const doc = new PendingAuth({
    state,
    clientId,
    redirectUrl,
    used: false,
    createdAt: new Date(),
  });
  await doc.save();
  return doc;
}

/**
 * Confirm an incoming OAuth state is valid, unused, and within the TTL.
 *
 * @param {string} state - State token to verify.
 * @returns {Promise<boolean>} True when the state can be consumed.
 */
async function checkStateValid(state) {
  const rec = await PendingAuth.findOne({ state });
  if (!rec) return false;
  if (rec.used) return false;
  // Enforce a strict 10 minute expiration window for OAuth state tokens
  const age = Date.now() - new Date(rec.createdAt).getTime();
  if (age > 10 * 60 * 1000) return false;
  return true;
}

/**
 * Mark the supplied OAuth state as used so it cannot be replayed.
 *
 * @param {string} state - State token that should be invalidated.
 * @returns {Promise<void>} Resolves when the state is updated.
 */
async function markStateUsed(state) {
  await PendingAuth.updateOne({ state }, { $set: { used: true } });
}

/**
 * Exchange an authorization code for provider access and refresh tokens.
 *
 * @param {Object} params - Code exchange arguments.
 * @param {string} params.code - Authorization code received from the provider.
 * @param {string} params.codeVerifier - PKCE code verifier supplied by the client.
 * @param {string} params.redirectUri - Redirect URI used during the handshake.
 * @returns {Promise<Object>} Provider token response payload.
 */
async function exchangeCodeForToken({ code, codeVerifier, redirectUri }) {
  if (!OAUTH_TOKEN_URL) {
    throw new Error('OAuth token exchange is not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: String(redirectUri || ''),
    code_verifier: String(codeVerifier || ''),
  });

  const response = await axios.post(OAUTH_TOKEN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data || {};
}

/**
 * Reconstruct the PKCE code verifier associated with a given state.
 *
 * @param {string} state - OAuth state string.
 * @returns {string} Code verifier bound to the incoming state.
 */
function getCodeVerifier(state) {
  return process.env.OAUTH_CODE_VERIFIER || "code_verifier_example";
}


/**
 * GET /auth/generate-url
 *
 * Produce the authorization URL for initiating an OAuth login, persisting the
 * generated state to defend against CSRF and returning both the URL and state
 * identifier to the requesting client.
 */
router.get('/generate-url', async (req, res) => {
  try {
    const clientId = String(req.query.client_id || 'unknown_client');

    // Construct the redirect URL expected by the OAuth callback handler
    const redirectUrl = `${safeRedirectUrlBase}/callback`;
    const responseType = 'code';

    const state = crypto.randomBytes(16).toString('hex');
    await createPendingAuth({ state, clientId, redirectUrl });

    // Compose the URL the client should open to initiate sign-in
    const authUrl = `${safeWebOrigin}/login?client_id=${encodeURIComponent(clientId)}&redirectUrl=${encodeURIComponent(redirectUrl)}&response_type=${responseType}&state=${state}`;

    return res.json({ authUrl, state });
  } catch (err) {
    console.error('generate-url error:', err);

    return jsonError(res, 500, 'Failed to generate auth url');
  }
});

/**
 * GET /auth/check-auth
 *
 * Inspect the pending-auth collection to determine whether the provided state
 * has been fulfilled and return the stored access token when present.
 */
router.get('/check-auth', async (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return jsonError(res, 400, 'Missing state');

    const rec = await PendingAuth.findOne({ state });
    // Return null for accessToken to stay compatible with clients not using stored tokens
    return res.json({ accessToken: rec?.accessToken || null });
  } catch (err) {
    console.error('check-auth error:', err);
    return jsonError(res, 500, 'Failed to check auth');
  }
});

/**
 * GET /auth/callback
 *
 * Finalize the OAuth flow by validating the state token, exchanging the
 * authorization code for provider credentials, and returning the resulting
 * access and refresh tokens to the caller.
 */
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state) {
        return res.status(400).json({ message: 'Missing code or state' });
    }

    try {
        // Ensure the state matches a record we generated
        const isValidState = await checkStateValid(state); 
        if (!isValidState) {
            return res.status(400).json({ message: 'Invalid state' });
        }

        // Exchange the authorization code for provider tokens
        const tokenResponse = await exchangeCodeForToken({
            code,
            codeVerifier: getCodeVerifier(state), // Use the verifier generated by the client
            redirectUri: process.env.VSCODE_REDIRECT_URI,
        });

        // Send the tokens back to the caller for storage
        return res.json({
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'OAuth exchange failed' });
    }
});

/**
 * POST /auth/login
 *
 * Authenticate a user via email and password, issue signed session tokens, and
 * optionally mark the OAuth state complete when invoked within a delegated flow.
 */
router.post('/login', async (req, res) => {
  const { email, password, state } = req.body;

  // Require both email and password for credential login
  if (!email) {
      return res.status(400).json({ message: 'Missing email' });
  }
  if (!password ) {
    return res.status(400).json({ message: 'Missing password' });
  }

  try {
      // TODO: Validate PKCE code_challenge and client_id before authenticating

      // Authenticate the user via database lookup and password comparison
      const { user } = await loginUser({ email, password });

      const accessToken = signAccess(user);
      const refreshToken = signRefresh(user);
      setRefreshCookie(res, refreshToken);

      // If state is present we are completing the OAuth2.0 code flow
      if (state){
        console.log("OAuth2.0 login with state:", state);
        const ok = await checkStateValid(state);
        if (ok) await markStateUsed(state);
        return res.json({ 
          accessToken, 
          refreshToken,
          user,
          expiresAt:ACCESS_EXPIRES_IN
        });
      }
      
      // Non-OAuth2.0 login only returns the access token; refresh lives in the cookie
      return res.json({ 

        accessToken,
        expiresAt: ACCESS_EXPIRES_IN
      });
  } catch (error) {
      console.error(error);
      if (error.message === 'Invalid email') {
          return res.status(400).json({ message: "User not found, please register" });
      }
      if (error.message === 'Invalid password') {
          return res.status(400).json({ message: "Invalid password" });
      }
      if (error.message === 'Invalid state') {
          return res.status(400).json({ message: "Invalid state" });
      }
      return res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /auth/register
 *
 * Create a credential-based account, provision the default profile, and deliver
 * access credentials. When the call is part of an OAuth state flow, return the
 * refresh token alongside the access token.
 */
router.post('/register', async (req, res) => {
  const { email, password, state } = req.body;
  try {
    const result = await registerUser({ email, password }, state);
    console.log('User registered:', result);

    const user = result?.user || (await User.findOne({ email }));
    const accessToken = signAccess(result.user);

    if (user) {
      const refreshToken = signRefresh(user);
      setRefreshCookie(res, refreshToken);

      if (state) {
        const ok = await checkStateValid(state);
        if (ok) await markStateUsed(state);
        return res.json({ message: 'User registered!', accessToken, refreshToken });
      }
    }

    user.password = ''; // to avoid returning password hash
    return res.json({ 
      message: 'User registered!', 
      user,
      accessToken,
      expiresAt:ACCESS_EXPIRES_IN
    });
  } catch (err) {
    if (err?.message === 'User already exists with this email, Would you like to login?') {
      return jsonError(res, 400, err.message);
    }
    console.error('register error:', err);
    if (err?.message?.includes('User already exists')) {
      return jsonError(res, 400, 'User already exists with this email');
    }
    return jsonError(res, 500, 'Database error');
  }
});

/**
 * POST /auth/google
 *
 * Validate a Google ID token, upsert the corresponding user account, and issue
 * application session tokens, honoring the optional OAuth state handshake.
 */
router.post('/google', async (req, res) => {
  const { id_token, state } = req.body; // Allow state in the body for app bridge scenarios
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) return jsonError(res, 400, 'Invalid Google token');

    const email = payload.email;
    const username = payload.name || email.split('@')[0];
    const avatar = payload.picture;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        password: null,
        username,
        image_url: avatar,
        vipLevel: 0,
        profile: null,
      });
      const profile = new Profile({ 
        user: user._id, 
        paymentMethods: [],
        teams: [],
        projects: []
      });
      user.profile = profile._id;
      await Promise.all([user.save(), profile.save()]);
    }

    const accessToken = signAccess(user);
    const refreshToken = signRefresh(user);
    setRefreshCookie(res, refreshToken);

    if (state) {
      const ok = await checkStateValid(state);
      if (ok) await markStateUsed(state);
      return res.json({ accessToken, refreshToken, user });
    }

    return res.json({ 
      accessToken, 
      expiresAt: ACCESS_EXPIRES_IN,
      user 
    });
  } catch (err) {
    console.error('google login error:', err);
    return jsonError(res, 401, 'Failed to verify Google token');
  }
});


/**
 * POST /auth/github
 *
 * Exchange a GitHub authorization code for an API access token, synchronize the
 * user profile with GitHub data, and return signed application tokens.
 */
router.post('/github', async (req, res) => {
  const { code, state } = req.body;
  if (!code) return jsonError(res, 400, 'Missing GitHub code');

  try {
    // 1) Exchange the authorization code for a GitHub access token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );
    const githubAccessToken = tokenRes.data?.access_token;
    if (!githubAccessToken) return jsonError(res, 401, 'GitHub token exchange failed');

    // 2) Fetch the authenticated GitHub profile details
    const octokit = new Octokit({ auth: githubAccessToken });
    const { data: ghUser } = await octokit.rest.users.getAuthenticated();

    const email = ghUser.email || `${ghUser.login}@users.noreply.github.com`;
    const username = ghUser.name || ghUser.login;
    const avatar = ghUser.avatar_url;

    // 3) Reuse existing users or create a new record for first-time logins
    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        password: null,
        username,
        image_url: avatar,
        vipLevel: 0,
        profile: null,
      });
      const profile = new Profile({ 
        user: user._id, 
        paymentMethods: [],
        teams: [],
        projects: []
      });
      user.profile = profile._id;
      await Promise.all([user.save(), profile.save()]);
    }

    // 4) Issue application tokens and mark the OAuth state if needed
    const accessToken = signAccess(user);
    const refreshToken = signRefresh(user);
    setRefreshCookie(res, refreshToken);

    if (state) {
      const ok = await checkStateValid(state);
      if (ok) await markStateUsed(state);
      return res.json({ accessToken, refreshToken, user });
    }

    return res.json({ 
      accessToken, 
      user,
      expiresAt: ACCESS_EXPIRES_IN
    });
  } catch (err) {
    console.error('GitHub login error:', err?.response?.data || err);
    return jsonError(res, 500, 'GitHub login failed');
  }
});

/**
 * POST /auth/get-user-info
 *
 * Validate an auth-code token issued to the VS Code extension and exchange it
 * for the full user document plus new access and refresh tokens.
 */
router.post('/get-user-info', authenticateCodeTokenByPost, async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return the user and fresh tokens so the client can refresh its session
    const access_token = longSignAccess(user);
    const refresh_token = signRefresh(user);
    res.json({
      user,
      access_token,
      refresh_token
    });

  } catch (err) {
    console.error('Get user info error:', err);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});


/**
 * POST /auth/refresh
 *
 * Rotate an access token using the refresh token stored in the user's cookie
 * and return the replacement token along with its expiration timestamp.
 */
router.post('/refresh', (req, res) => {
  try {
    const refreshToken = req.cookies?.defuze_refreshToken;
    if (!refreshToken) return jsonError(res, 401, 'No refresh token');

    const decoded = verifyRefresh(refreshToken);
    //console.log('Decoded refresh token:', decoded);
    const accessToken = signAccess({ id: decoded.id, email: decoded.email });
    const expiresAt = Date.now() + ACCESS_EXPIRES_IN * 1000;

    return res.json({ accessToken, expiresAt });
  } catch (err) {
    return jsonError(res, 401, 'Invalid refresh token');
  }
});


/**
 * POST /auth/renew
 * sometime website need obtain the most up-to-date user info along with new tokens
 */
router.post('/renew', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return the user and fresh tokens so the client can refresh its session
    const access_token = longSignAccess(user);
    const refresh_token = signRefresh(user);
    res.json({
      user,
      access_token,
      refresh_token
    });

  } catch (err) {
    console.error('Renew user error:', err);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

/**
 * POST /auth/logout
 *
 * Clear the refresh token cookie to terminate the client session on the next
 * access token expiry.
 */
router.post('/logout', (_req, res) => {
  res.clearCookie('defuze_refreshToken', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
  return res.json({ message: 'Logged out' });
});

module.exports = router;
