const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Helper to get environment variable with fallback reading from .env file on disk
 * This prevents issues when developers update .env without restarting the Node server
 */
function getEnvVar(key) {
  if (process.env[key] && process.env[key].trim()) {
    return process.env[key].trim();
  }
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const eqIdx = trimmed.indexOf('=');
          const k = trimmed.substring(0, eqIdx).trim();
          const v = trimmed.substring(eqIdx + 1).trim();
          if (k === key) {
            process.env[key] = v;
            return v;
          }
        }
      }
    }
  } catch (err) {
    // ignore filesystem read error
  }
  return '';
}

/**
 * Clean and sanitize Google Client ID from environment variable
 * Handles accidental quotes, surrounding whitespace, and JSON file naming patterns
 */
function getCleanGoogleClientId() {
  let val = getEnvVar('GOOGLE_CLIENT_ID');
  val = val.replace(/^["']|["']$/g, '').trim();
  // If user accidentally pasted the downloaded JSON filename (e.g. client_secret_962292...json)
  if (val.startsWith('client_secret_')) {
    val = val.replace(/^client_secret_/, '');
  }
  if (val.endsWith('.json')) {
    val = val.replace(/\.json$/, '');
  }
  return val.trim();
}

/**
 * Clean and sanitize Google Client Secret
 */
function getCleanGoogleClientSecret() {
  let val = getEnvVar('GOOGLE_CLIENT_SECRET');
  return val.replace(/^["']|["']$/g, '').trim();
}

/**
 * Clean and sanitize Facebook App ID
 */
function getCleanFacebookAppId() {
  let val = getEnvVar('FACEBOOK_APP_ID');
  return val.replace(/^["']|["']$/g, '').trim();
}

/**
 * Clean and sanitize Facebook App Secret
 */
function getCleanFacebookAppSecret() {
  let val = getEnvVar('FACEBOOK_APP_SECRET');
  return val.replace(/^["']|["']$/g, '').trim();
}

/**
 * Generate a cryptographically secure random state token to prevent CSRF attacks
 */
function generateOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Determine Google OAuth Callback URL
 * Prefers explicit GOOGLE_CALLBACK_URL from env, otherwise falls back to current request host
 */
function getGoogleCallbackUrl(req) {
  const cb = getEnvVar('GOOGLE_CALLBACK_URL');
  if (cb) {
    return cb.replace(/^["']|["']$/g, '').trim();
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}/auth/google/callback`;
}

/**
 * Determine Facebook OAuth Callback URL
 * Prefers explicit FACEBOOK_CALLBACK_URL from env, otherwise falls back to current request host
 */
function getFacebookCallbackUrl(req) {
  const cb = getEnvVar('FACEBOOK_CALLBACK_URL');
  if (cb) {
    return cb.replace(/^["']|["']$/g, '').trim();
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}/auth/facebook/callback`;
}

/**
 * Check if Google OAuth credentials are configured in environment
 */
function isGoogleConfigured() {
  const clientId = getCleanGoogleClientId();
  const clientSecret = getCleanGoogleClientSecret();
  return Boolean(clientId && clientSecret && !clientId.includes('your_google_client_id'));
}

/**
 * Check if Facebook OAuth credentials are configured in environment
 */
function isFacebookConfigured() {
  const appId = getCleanFacebookAppId();
  const appSecret = getCleanFacebookAppSecret();
  return Boolean(appId && appSecret && !appId.includes('your_facebook_app_id'));
}

/**
 * Build Google OAuth Authorization URL
 */
function getGoogleAuthUrl(req, state) {
  const clientId = getCleanGoogleClientId();
  const redirectUri = getGoogleCallbackUrl(req);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: state,
    access_type: 'online',
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange Google authorization code for access token and profile info
 */
async function exchangeGoogleCode(code, req) {
  const clientId = getCleanGoogleClientId();
  const clientSecret = getCleanGoogleClientSecret();
  const redirectUri = getGoogleCallbackUrl(req);

  // 1. Exchange authorization code for token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({}));
    throw new Error(errorData.error_description || 'Failed to exchange authorization code with Google.');
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error('No access token returned from Google.');
  }

  // 2. Fetch authenticated user profile
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!userResponse.ok) {
    throw new Error('Failed to retrieve user profile from Google.');
  }

  const profile = await userResponse.json();

  return {
    provider: 'google',
    id: profile.sub,
    email: profile.email ? profile.email.toLowerCase().trim() : null,
    emailVerified: Boolean(profile.email_verified),
    name: profile.name || (profile.given_name ? `${profile.given_name} ${profile.family_name || ''}`.trim() : 'Google User'),
    picture: profile.picture || '',
  };
}

/**
 * Build Facebook OAuth Authorization URL
 */
function getFacebookAuthUrl(req, state) {
  const appId = getCleanFacebookAppId();
  const redirectUri = getFacebookCallbackUrl(req);

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: state,
    scope: 'email,public_profile',
    response_type: 'code',
  });

  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange Facebook authorization code for access token and profile info
 */
async function exchangeFacebookCode(code, req) {
  const appId = getCleanFacebookAppId();
  const appSecret = getCleanFacebookAppSecret();
  const redirectUri = getFacebookCallbackUrl(req);

  // 1. Exchange authorization code for access token
  const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  tokenUrl.search = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code: code,
  }).toString();

  const tokenResponse = await fetch(tokenUrl.toString(), {
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to exchange authorization code with Facebook.');
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error('No access token returned from Facebook.');
  }

  // 2. Fetch authenticated user profile
  const profileUrl = new URL('https://graph.facebook.com/me');
  profileUrl.search = new URLSearchParams({
    fields: 'id,name,email,picture.type(large)',
    access_token: accessToken,
  }).toString();

  const profileResponse = await fetch(profileUrl.toString(), {
    signal: AbortSignal.timeout(10000),
  });

  if (!profileResponse.ok) {
    throw new Error('Failed to retrieve user profile from Facebook.');
  }

  const profile = await profileResponse.json();

  return {
    provider: 'facebook',
    id: profile.id,
    email: profile.email ? profile.email.toLowerCase().trim() : null,
    emailVerified: Boolean(profile.email), // Meta verifies primary account email when returned
    name: profile.name || 'Facebook User',
    picture: profile.picture?.data?.url || '',
  };
}

module.exports = {
  getEnvVar,
  generateOAuthState,
  getGoogleCallbackUrl,
  getFacebookCallbackUrl,
  getCleanGoogleClientId,
  getCleanGoogleClientSecret,
  getCleanFacebookAppId,
  getCleanFacebookAppSecret,
  isGoogleConfigured,
  isFacebookConfigured,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getFacebookAuthUrl,
  exchangeFacebookCode,
};
