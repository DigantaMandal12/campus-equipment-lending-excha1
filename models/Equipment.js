const equipmentRepo = require('../services/firebase/equipment');
const usersRepo = require('../services/firebase/users');

class EquipmentDoc {
  constructor(data = {}) {
    Object.assign(this, data);
    if (!this._id && this.id) this._id = this.id;
    if (!this.id && this._id) this.id = this._id;
    if (!this.name && this.title) this.name = this.title;
  }

  get name() {
    return this.title;
  }

  set name(val) {
    this.title = val;
  }

  async save() {
    if (this._id) {
      const updated = await equipmentRepo.updateEquipment(this._id, this);
      Object.assign(this, updated);
      return this;
    } else {
      const created = await equipmentRepo.createEquipment(this);
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
    this._populateOwner = false;
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

  populate(field) {
    if (typeof field === 'string' && field.includes('owner')) {
      this._populateOwner = true;
    }
    return this;
  }

  then(resolve, reject) {
    return this.executor(this).then(resolve, reject);
  }

  catch(reject) {
    return this.executor(this).catch(reject);
  }
}

const Equipment = function (data) {
  return new EquipmentDoc(data);
};

Equipment.find = function (filter = {}) {
  return new QueryChain(async (chain) => {
    let list = await equipmentRepo.getAllEquipment(filter);

    if (chain._populateOwner) {
      for (const item of list) {
        if (item.owner && (typeof item.owner === 'string' || !item.owner.name)) {
          const ownerId = typeof item.owner === 'object' ? (item.owner._id || item.owner.id) : item.owner;
          const owner = await usersRepo.getUserById(ownerId);
          if (owner) {
            item.owner = {
              _id: owner._id,
              id: owner._id,
              name: owner.name,
              email: owner.email,
              department: owner.department,
              phone: owner.phone || '',
              upiId: owner.upiId || ''
            };
          }
        }
      }
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

    return chain._isLean ? list : list.map(item => new EquipmentDoc(item));
  });
};

Equipment.findById = function (id) {
  return new QueryChain(async (chain) => {
    const item = await equipmentRepo.getEquipmentById(id, chain._populateOwner);
    if (!item) return null;
    return chain._isLean ? item : new EquipmentDoc(item);
  });
};

Equipment.findByIdAndUpdate = async function (id, updates) {
  const updated = await equipmentRepo.updateEquipment(id, updates);
  if (!updated) return null;
  return new EquipmentDoc(updated);
};

Equipment.findByIdAndDelete = async function (id) {
  return await equipmentRepo.deleteEquipment(id);
};

Equipment.countDocuments = async function (filter = {}) {
  return await equipmentRepo.countEquipment(filter);
};

Equipment.create = async function (data) {
  const created = await equipmentRepo.createEquipment(data);
  return new EquipmentDoc(created);
};

module.exports = Equipment;
