const reviewsRepo = require('../services/firebase/reviews');

class ReviewDoc {
  constructor(data = {}) {
    Object.assign(this, data);
    if (!this._id && this.id) this._id = this.id;
    if (!this.id && this._id) this.id = this._id;
  }

  async save() {
    if (this._id) {
      const updated = await reviewsRepo.updateReview(this._id, this);
      Object.assign(this, updated);
      return this;
    } else {
      const created = await reviewsRepo.createReview(this);
      Object.assign(this, created);
      return this;
    }
  }
}

class QueryChain {
  constructor(executor) {
    this.executor = executor;
    this._sortObj = null;
    this._isLean = false;
  }

  populate() {
    return this;
  }

  sort(s) {
    this._sortObj = s;
    return this;
  }

  lean() {
    this._isLean = true;
    return this;
  }

  then(resolve, reject) {
    return this.executor(this).then(resolve, reject);
  }

  catch(reject) {
    return this.executor(this).catch(reject);
  }
}

const Review = function (data) {
  return new ReviewDoc(data);
};

Review.find = function (filter = {}) {
  return new QueryChain(async (chain) => {
    let list = await reviewsRepo.getReviews(filter);
    if (chain._sortObj && chain._sortObj.createdAt === -1) {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return chain._isLean ? list : list.map(r => new ReviewDoc(r));
  });
};

Review.findOne = function (filter = {}) {
  return new QueryChain(async (chain) => {
    const list = await reviewsRepo.getReviews(filter);
    if (!list || list.length === 0) return null;
    return chain._isLean ? list[0] : new ReviewDoc(list[0]);
  });
};

Review.create = async function (data) {
  const created = await reviewsRepo.createReview(data);
  return new ReviewDoc(created);
};

module.exports = Review;
