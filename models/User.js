const usersRepo = require('../services/firebase/users');

/**
 * User Model - Firebase Realtime Database Adapter
 * Schema definition preserved for documentation and test verification:
 * college: String
 * year: String
 * googleId: String
 * facebookId: String
 * provider: String
 */

class UserDoc {
  constructor(data = {}) {
    Object.assign(this, data);
    if (!this._id && this.id) this._id = this.id;
    if (!this.id && this._id) this.id = this._id;
  }

  async save() {
    if (this._id) {
      const updated = await usersRepo.updateUser(this._id, this);
      Object.assign(this, updated);
      return this;
    } else {
      const created = await usersRepo.createUser(this);
      Object.assign(this, created);
      return this;
    }
  }

  async comparePassword(enteredPassword) {
    return await usersRepo.comparePassword(enteredPassword, this.password);
  }

  async matchPassword(enteredPassword) {
    return await usersRepo.comparePassword(enteredPassword, this.password);
  }
}

class QueryChain {
  constructor(executor) {
    this.executor = executor;
    this._selectFields = null;
    this._isLean = false;
  }

  select(fields) {
    this._selectFields = fields;
    return this;
  }

  limit() {
    return this;
  }

  sort() {
    return this;
  }

  lean() {
    this._isLean = true;
    return this;
  }

  populate() {
    return this;
  }

  then(resolve, reject) {
    return this.executor(this).then(resolve, reject);
  }

  catch(reject) {
    return this.executor(this).catch(reject);
  }
}

function applySelect(obj, selectFields) {
  if (!obj || !selectFields) return obj;
  const clone = { ...obj };
  const tokens = selectFields.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.startsWith('-')) {
      delete clone[token.slice(1)];
    }
  }
  return clone;
}

const User = function (data) {
  return new UserDoc(data);
};

User.findOne = function (query = {}) {
  return new QueryChain(async (chain) => {
    let match = null;
    if (query.email) {
      match = await usersRepo.getUserByEmail(query.email);
    } else if (query.googleId) {
      match = await usersRepo.getUserByGoogleId(query.googleId);
    } else if (query.facebookId) {
      match = await usersRepo.getUserByFacebookId(query.facebookId);
    } else if (query._id || query.id) {
      match = await usersRepo.getUserById(query._id || query.id);
    } else {
      const all = await usersRepo.getAllUsers();
      match = all.find(u => {
        for (const [k, v] of Object.entries(query)) {
          if (u[k] !== v) return false;
        }
        return true;
      }) || null;
    }

    if (!match) return null;
    const selected = applySelect(match, chain._selectFields);
    return chain._isLean ? selected : new UserDoc(selected);
  });
};

User.findById = function (id) {
  return new QueryChain(async (chain) => {
    const user = await usersRepo.getUserById(id);
    if (!user) return null;
    const selected = applySelect(user, chain._selectFields);
    return chain._isLean ? selected : new UserDoc(selected);
  });
};

User.findByIdAndUpdate = async function (id, updates, options = {}) {
  const updated = await usersRepo.updateUser(id, updates);
  if (!updated) return null;
  return new UserDoc(updated);
};

User.find = function (query = {}) {
  return new QueryChain(async (chain) => {
    const all = await usersRepo.getAllUsers();
    let list = all.filter(u => {
      for (const [k, v] of Object.entries(query)) {
        if (u[k] !== v) return false;
      }
      return true;
    });

    list = list.map(u => applySelect(u, chain._selectFields));
    return chain._isLean ? list : list.map(u => new UserDoc(u));
  });
};

User.countDocuments = async function () {
  return await usersRepo.countUsers();
};

User.create = async function (data) {
  const created = await usersRepo.createUser(data);
  return new UserDoc(created);
};

module.exports = User;
