const borrowRepo = require('../services/firebase/borrow');

class BorrowRequestDoc {
  constructor(data = {}) {
    Object.assign(this, data);
    if (!this._id && this.id) this._id = this.id;
    if (!this.id && this._id) this.id = this._id;
    if (!this.orderNumber) {
      this.orderNumber = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
    }
    if (!this.verificationCode) {
      this.verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
  }

  async save() {
    if (this._id) {
      const updated = await borrowRepo.updateBorrowRequest(this._id, this);
      Object.assign(this, updated);
      return this;
    } else {
      const created = await borrowRepo.createBorrowRequest(this);
      Object.assign(this, created);
      return this;
    }
  }
}

class QueryChain {
  constructor(executor) {
    this.executor = executor;
    this._selectFields = null;
    this._sortObj = null;
    this._limitNum = null;
    this._isLean = false;
    this._populateRefs = false;
  }

  select(fields) {
    this._selectFields = fields;
    return this;
  }

  sort(sortObj) {
    this._sortObj = sortObj;
    return this;
  }

  limit(n) {
    this._limitNum = n;
    return this;
  }

  lean() {
    this._isLean = true;
    return this;
  }

  populate(fields) {
    this._populateRefs = true;
    return this;
  }

  then(resolve, reject) {
    return this.executor(this).then(resolve, reject);
  }

  catch(reject) {
    return this.executor(this).catch(reject);
  }
}

const BorrowRequest = function (data) {
  return new BorrowRequestDoc(data);
};

BorrowRequest.find = function (filter = {}) {
  return new QueryChain(async (chain) => {
    let list = await borrowRepo.getAllBorrowRequests(filter);

    if (chain._populateRefs) {
      const populatedList = [];
      for (const item of list) {
        populatedList.push(await borrowRepo.populateBorrowRequest(item));
      }
      list = populatedList;
    }

    if (chain._sortObj) {
      if (chain._sortObj.createdAt === -1) {
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } else if (chain._sortObj.createdAt === 1) {
        list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      }
    }

    if (chain._limitNum && typeof chain._limitNum === 'number') {
      list = list.slice(0, chain._limitNum);
    }

    return chain._isLean ? list : list.map(item => new BorrowRequestDoc(item));
  });
};

BorrowRequest.findOne = function (filter = {}) {
  return new QueryChain(async (chain) => {
    const list = await borrowRepo.getAllBorrowRequests(filter);
    if (!list || list.length === 0) return null;
    let item = list[0];
    if (chain._populateRefs) {
      item = await borrowRepo.populateBorrowRequest(item);
    }
    return chain._isLean ? item : new BorrowRequestDoc(item);
  });
};

BorrowRequest.findById = function (id) {
  return new QueryChain(async (chain) => {
    const item = await borrowRepo.getBorrowRequestById(id, chain._populateRefs);
    if (!item) return null;
    return chain._isLean ? item : new BorrowRequestDoc(item);
  });
};

BorrowRequest.findByIdAndUpdate = async function (id, updates) {
  const updated = await borrowRepo.updateBorrowRequest(id, updates);
  if (!updated) return null;
  return new BorrowRequestDoc(updated);
};

BorrowRequest.countDocuments = async function (filter = {}) {
  return await borrowRepo.countBorrowRequests(filter);
};

BorrowRequest.create = async function (data) {
  const created = await borrowRepo.createBorrowRequest(data);
  return new BorrowRequestDoc(created);
};

module.exports = BorrowRequest;
