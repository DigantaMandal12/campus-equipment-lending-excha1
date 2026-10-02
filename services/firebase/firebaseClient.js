const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Production Firebase Realtime Database Client
 * Supports:
 * 1. Firebase Admin SDK (when installed and service account credentials provided)
 * 2. Firebase REST API (fast, lightweight, zero-dependency serverless mode)
 * 3. Local/Offline in-memory storage (with optional local JSON persistence for testing)
 */

class FirebaseClient {
  constructor() {
    this.admin = null;
    this.db = null;
    this.isLive = false;
    this.memoryDb = {
      users: {},
      equipment: {},
      borrowRequests: {},
      reviews: {},
      notifications: {},
      otp: {},
      sessions: {}
    };

    this.init();
  }

  init() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    // Try initializing Firebase Admin SDK if available
    try {
      const adminModule = require('firebase-admin');
      if (adminModule && (adminModule.apps.length > 0 || (projectId && clientEmail && privateKey && databaseURL))) {
        if (!adminModule.apps.length) {
          if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
          }
          adminModule.initializeApp({
            credential: adminModule.credential.cert({
              projectId,
              clientEmail,
              privateKey,
            }),
            databaseURL,
          });
        }
        this.admin = adminModule;
        this.db = adminModule.database();
        this.isLive = true;
        console.log('[FIREBASE] Initialized Firebase Admin SDK for Realtime Database.');
        return;
      }
    } catch (e) {
      // Firebase Admin SDK not installed or credentials not provided; fall back to REST or local store
    }

    if (databaseURL && !databaseURL.includes('your-project') && !databaseURL.includes('example')) {
      this.databaseURL = databaseURL.replace(/\/$/, '');
      this.authToken = process.env.FIREBASE_DATABASE_SECRET || process.env.FIREBASE_AUTH_TOKEN || '';
      this.isLive = true;
      console.log(`[FIREBASE] Configured Firebase Realtime Database REST client for ${this.databaseURL}`);
    } else {
      console.log('[FIREBASE] Running in local/test memory mode. Realtime Database operations are active and persistent in memory.');
      this.seedInitialData();
    }
  }

  seedInitialData() {
    try {
      const { FALLBACK_EQUIPMENT } = require('../../config/sampleData');
      if (Array.isArray(FALLBACK_EQUIPMENT)) {
        FALLBACK_EQUIPMENT.forEach(item => {
          const id = item._id || item.id || this.generateKey();
          this.memoryDb.equipment[id] = {
            ...item,
            _id: id,
            id: id,
            createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString()
          };
          if (item.owner && typeof item.owner === 'object' && item.owner._id) {
            const ownerId = item.owner._id;
            this.memoryDb.users[ownerId] = {
              _id: ownerId,
              id: ownerId,
              name: item.owner.name,
              email: item.owner.email,
              department: item.owner.department,
              phone: item.owner.phone || '',
              upiId: item.owner.upiId || '',
              role: 'teacher',
              college: 'Apex Institute of Technology',
              year: 'Faculty',
              isVerified: true,
              trustScore: 5.0,
              createdAt: new Date().toISOString()
            };
          }
        });
      }
    } catch (err) {
      // Fallback data loading error
    }
  }

  generateKey() {
    // Generate a 24-character hexadecimal ID compatible with MongoDB ObjectId and Firebase keys
    return crypto.randomBytes(12).toString('hex');
  }

  async get(fullPath) {
    const cleanPath = fullPath.replace(/^\/|\/$/g, '');

    if (this.db) {
      const snapshot = await this.db.ref(cleanPath).once('value');
      return snapshot.val();
    }

    if (this.databaseURL && typeof fetch === 'function') {
      try {
        const authParam = this.authToken ? `?auth=${this.authToken}` : '';
        const res = await fetch(`${this.databaseURL}/${cleanPath}.json${authParam}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn(`[FIREBASE REST GET ERROR] ${cleanPath}:`, err.message);
      }
    }

    // In-memory fallback
    const segments = cleanPath.split('/');
    let curr = this.memoryDb;
    for (const seg of segments) {
      if (curr && typeof curr === 'object' && seg in curr) {
        curr = curr[seg];
      } else {
        return null;
      }
    }
    return curr !== undefined ? JSON.parse(JSON.stringify(curr)) : null;
  }

  async set(fullPath, data) {
    const cleanPath = fullPath.replace(/^\/|\/$/g, '');

    if (this.db) {
      await this.db.ref(cleanPath).set(data);
      return data;
    }

    if (this.databaseURL && typeof fetch === 'function') {
      try {
        const authParam = this.authToken ? `?auth=${this.authToken}` : '';
        const res = await fetch(`${this.databaseURL}/${cleanPath}.json${authParam}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn(`[FIREBASE REST SET ERROR] ${cleanPath}:`, err.message);
      }
    }

    // In-memory fallback
    const segments = cleanPath.split('/');
    let curr = this.memoryDb;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!curr[seg] || typeof curr[seg] !== 'object') {
        curr[seg] = {};
      }
      curr = curr[seg];
    }
    const lastSeg = segments[segments.length - 1];
    curr[lastSeg] = JSON.parse(JSON.stringify(data));
    return data;
  }

  async update(fullPath, updates) {
    const cleanPath = fullPath.replace(/^\/|\/$/g, '');

    if (this.db) {
      await this.db.ref(cleanPath).update(updates);
      return updates;
    }

    if (this.databaseURL && typeof fetch === 'function') {
      try {
        const authParam = this.authToken ? `?auth=${this.authToken}` : '';
        const res = await fetch(`${this.databaseURL}/${cleanPath}.json${authParam}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn(`[FIREBASE REST UPDATE ERROR] ${cleanPath}:`, err.message);
      }
    }

    // In-memory fallback
    const existing = (await this.get(cleanPath)) || {};
    const merged = { ...existing, ...updates };
    await this.set(cleanPath, merged);
    return merged;
  }

  async push(collectionPath, data) {
    const cleanCollection = collectionPath.replace(/^\/|\/$/g, '');
    const newId = this.generateKey();
    const recordWithId = {
      ...data,
      _id: data._id || newId,
      id: data._id || newId,
      createdAt: data.createdAt || new Date().toISOString()
    };
    await this.set(`${cleanCollection}/${recordWithId._id}`, recordWithId);
    return recordWithId;
  }

  async remove(fullPath) {
    const cleanPath = fullPath.replace(/^\/|\/$/g, '');

    if (this.db) {
      await this.db.ref(cleanPath).remove();
      return true;
    }

    if (this.databaseURL && typeof fetch === 'function') {
      try {
        const authParam = this.authToken ? `?auth=${this.authToken}` : '';
        const res = await fetch(`${this.databaseURL}/${cleanPath}.json${authParam}`, {
          method: 'DELETE'
        });
        if (res.ok) return true;
      } catch (err) {
        console.warn(`[FIREBASE REST REMOVE ERROR] ${cleanPath}:`, err.message);
      }
    }

    // In-memory fallback
    const segments = cleanPath.split('/');
    let curr = this.memoryDb;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!curr[seg] || typeof curr[seg] !== 'object') {
        return true;
      }
      curr = curr[seg];
    }
    const lastSeg = segments[segments.length - 1];
    delete curr[lastSeg];
    return true;
  }
}

// Global singleton for serverless connection reuse
if (!global.__firebaseClientInstance) {
  global.__firebaseClientInstance = new FirebaseClient();
}

module.exports = global.__firebaseClientInstance;
