'use strict'

let pg = require('pg');

class DBService {
  constructor() {
    this.connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost/githubDB';

  }

  queryDatabase(queryString) { 
    return new Promise((resolve, reject) => {
      let resultQuery = [];
      this.client = new pg.Client(this.connectionString);
      this.client.connect();

      const query = this.client.query(queryString, (err, result) => {
        if (err) { console.log('reject query error', queryString + err); reject(queryString + err); }
        if (result) console.log('query result', result.rows);
      });
      query.on('row', (row) => {
        resultQuery.push(row);
      })
      query.on('end', () => {
        this.client.end();
        resolve(resultQuery);
      })
    })
  }
}

module.exports = DBService;

// usage
// let result = yield dbService.queryDatabase(queryString);

// db.tx(function (t) {
//     // `t` and `this` here are the same;
//     var queries = [
//         this.none('drop table users;'),
//         this.none('create table users(id serial not null, name text not null)')
//     ];
//     for (var i = 1; i <= 100; i++) {
//         queries.push(this.none('insert into users(name) values($1)', 'name-' + i));
//     }
//     queries.push(
//         this.tx(function (t1) {
//             // t1 = this != t;
//             return this.tx(function (t2) {
//                 // t2 = this != t1 != t;
//                 return this.one('select count(*) from users');
//             });
//         }));
//     return this.batch(queries);
// })
//     .then(function (data) {
//         console.log(data); // printing transaction result;
//     })
//     .catch(function (error) {
//         console.log(error); // printing the error;
//     });

