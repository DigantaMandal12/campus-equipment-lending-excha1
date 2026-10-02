const notifRepo = require('../services/firebase/notifications');

class NotificationDoc {
  constructor(data = {}) {
    Object.assign(this, data);
    if (!this._id && this.id) this._id = this.id;
    if (!this.id && this._id) this.id = this._id;
  }
}

class QueryChain {
  constructor(executor) {
    this.executor = executor;
    this._sortObj = null;
    this._isLean = false;
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

const Notification = function (data) {
  return new NotificationDoc(data);
};

Notification.find = function (filter = {}) {
  return new QueryChain(async (chain) => {
    const userId = filter.user ? (filter.user._id || filter.user.id || filter.user) : null;
    let list = await notifRepo.getNotificationsByUser(userId);
    return chain._isLean ? list : list.map(n => new NotificationDoc(n));
  });
};

Notification.create = async function (data) {
  const created = await notifRepo.createNotification(data);
  return new NotificationDoc(created);
};

Notification.updateMany = async function (filter = {}, updates = {}) {
  const userId = filter.user ? (filter.user._id || filter.user.id || filter.user) : null;
  if (updates.isRead) {
    await notifRepo.markAllRead(userId);
  }
  return { acknowledged: true };
};

module.exports = Notification;
