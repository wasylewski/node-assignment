'use strict'

class User {
  constructor(token, userId, login) {
    Object.assign(this, { token, userId, login });
  }
}

module.exports = User;