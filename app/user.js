'use strict'

class User {
  constructor(token, userId, login) {
    console.log('setting user in the app');
    Object.assign(this, { token, userId, login });
  }
}

module.exports = User;