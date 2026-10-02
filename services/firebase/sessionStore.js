const client = require('./firebaseClient');

let sessionModule;
try {
  sessionModule = require('express-session');
} catch (e) {
  sessionModule = null;
}

const BaseStore = sessionModule && sessionModule.Store ? sessionModule.Store : class DummyStore {};

class FirebaseSessionStore extends BaseStore {
  constructor(options = {}) {
    super(options);
    this.ttlMs = (options.ttl || 7 * 24 * 60 * 60) * 1000; // default 7 days
    console.log('[SESSION] Initialized FirebaseSessionStore for Vercel production persistence.');
  }

  async get(sid, callback = () => {}) {
    try {
      const data = await client.get(`sessions/${sid}`);
      if (!data) {
        return callback(null, null);
      }

      // Check TTL expiry
      if (data._expiresAt && Date.now() > data._expiresAt) {
        await client.remove(`sessions/${sid}`);
        return callback(null, null);
      }

      const sess = data.sessionData || data;
      return callback(null, sess);
    } catch (err) {
      console.error(`[SESSION GET ERROR] ${sid}:`, err.message);
      return callback(err);
    }
  }

  async set(sid, session, callback = () => {}) {
    try {
      let maxAge = this.ttlMs;
      if (session && session.cookie && session.cookie.maxAge) {
        maxAge = session.cookie.maxAge;
      }
      const record = {
        sid,
        sessionData: session,
        updatedAt: Date.now(),
        _expiresAt: Date.now() + maxAge
      };

      await client.set(`sessions/${sid}`, record);
      return callback(null);
    } catch (err) {
      console.error(`[SESSION SET ERROR] ${sid}:`, err.message);
      return callback(err);
    }
  }

  async destroy(sid, callback = () => {}) {
    try {
      await client.remove(`sessions/${sid}`);
      return callback(null);
    } catch (err) {
      console.error(`[SESSION DESTROY ERROR] ${sid}:`, err.message);
      return callback(err);
    }
  }

  async touch(sid, session, callback = () => {}) {
    try {
      let maxAge = this.ttlMs;
      if (session && session.cookie && session.cookie.maxAge) {
        maxAge = session.cookie.maxAge;
      }
      await client.update(`sessions/${sid}`, {
        updatedAt: Date.now(),
        _expiresAt: Date.now() + maxAge
      });
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }
}

module.exports = FirebaseSessionStore;
