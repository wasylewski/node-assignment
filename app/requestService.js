'use strict'

class RequestClient {
  constructor() {
    this.request = require('request');
  }

  get(url) { console.log(url);
    return new Promise((resolve, reject) => {
      this.request({
        headers: { 'user-agent': 'node.js' },
        uri: url,
        method: 'GET'
      }, (error, response, body) => {
        if (error) reject(error);
        resolve(body);
      })

    })
  }
}

module.exports = RequestClient;
