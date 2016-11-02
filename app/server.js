'use strict'

let util = require('util');
let express = require('express');
let passport = require('passport');
let bodyParser = require('body-parser');
let GitHubStrategy = require('passport-github2').Strategy;
let partials = require('express-partials');
let methodOverride = require('method-override');
let session = require('express-session');
let request = require('request');
let http = require('http');
// let pg = require('pg');
let RequestClient = require('./requestService');
let requestClient = new RequestClient();
let User = require('./user.js');
let DBService = require('./dbService');
let dbService = new DBService();

//postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
// let connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost/githubDB';
let user = null;
let token = null;

let GITHUB_CLIENT_ID = '5301c2ab0614cc72f15c';
let GITHUB_CLIENT_SECRET = 'be52db4573cf12873a57117e59848307e0f0a37d';

passport.serializeUser((user, done) => done(null, user));

passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: "http://127.0.0.1:3000/auth/github/callback"
},
  (accessToken, refreshToken, profile, done) => {
    token = accessToken;
    // console.log('accessToken', accessToken);
    // console.log('refreshToken', refreshToken);
    // console.log(profile);

    process.nextTick(() => {
      return done(null, profile);
    });
  }
));

////

var app = express();

// console.log(__dirname);

// configure Express
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

app.use(session({ secret: 'adam alinoe', resave: false, saveUninitialized: false }));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => res.render('index', { user: req.user }));

app.get('/login', (req, res) => {
  res.render('login', { user: req.user });
});

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }), (req, res) => { /*tutaj nigdy nie bedziemy, idz do callback*/ });

app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/login' }), (req, res) => {
  res.redirect('/account');
});

app.get('/account', ensureAuthenticated, (req, res) => {
  res.locals.user = (req.user);
  let data = req.user._json;

  let queryString = `UPDATE user_details set login='${data.login}', github_user_id=${data.id}, html_url='${data.html_url}', repos_url='${data.repos_url}', token='${token}' where EXISTS (SELECT * FROM user_details WHERE user_details.github_user_id = ${data.id});
      INSERT INTO user_details (login, github_user_id, html_url, repos_url, token)  
      SELECT '${data.login}', ${data.id}, '${data.html_url}', '${data.repos_url}', '${token}'
      WHERE NOT EXISTS (SELECT 1 FROM user_details WHERE user_details.github_user_id = ${data.id});`

  dbService.queryDatabase(queryString);
  setUser(data.login);
  res.render('account');
});

app.get('/repositories', ensureAuthenticated, (req, res) => {

  const storeRepositories = (body) => {
    return new Promise((resolve, reject) => {
      let repositories = JSON.parse(body);

      repositories.forEach((item, index) => {
        let queryString = `UPDATE repositories set git_project_id='${item.id}', project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}'
          where EXISTS (SELECT * FROM repositories WHERE repositories.git_project_id = ${item.id});

          INSERT INTO repositories (git_project_id, project_name, full_project_name, html_url, description, api_url)
          SELECT '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
          WHERE NOT EXISTS (SELECT 1 FROM repositories WHERE repositories.git_project_id = ${item.id});`

        dbService.queryDatabase(queryString);

        if (index === repositories.length - 1) resolve(repositories);

      })
    })
  }

  const displayRepositories = (repositories) => res.render('repositories', { repositories: repositories });

  requestClient.get(`https://api.github.com/users/${user.login}/repos`)
    .then(storeRepositories)
    .then(displayRepositories)
    .catch(onError);
});


app.get(`/repositories/issues/:name`, ensureAuthenticated, (req, res) => {
  printMessage('user.userId', user.userId);

  const storeIssues = (body) => {
    return new Promise((resolve, reject) => {
      let issues = JSON.parse(body);

      issues.forEach((item, index) => {
        let queryString = `UPDATE issues set url='${item.url}', repository_url='${item.repository_url}', git_issue_id='${item.id}', title='${item.title}', user_id='${item.description}', user_id='${user.userId}' body='${item.body}'
        WHERE EXISTS(SELECT * FROM issues WHERE issues.git_issue_id=${item.id});

        INSERT INTO issues (url, repository_url, git_issue_id, title, user_id, user_id, body)
        SELECT '${item.url}', '${item.repository_url}', ${item.id}, '${item.title}', '${item.description}', ${user.userId}, '${item.body}'
        WHERE NOT EXISTS (SELECT 1 FROM issues WHERE issues.git_issue_id=${item.id});`

        dbService.queryDatabase(queryString)
          .catch((responseQuery) => { return reject(responseQuery) });

        printMessage('going further, not exiting');

        if (index === issues.length) { console.log(index, issues.length); return resolve(issues);}

      })

    })

  }

  requestClient.get(`https://api.github.com/repos/${user.login}/${req.params.name}/issues`)
    .then(storeIssues)
    .then((res) => console.log('success storeIssues', res))
    .catch(onError)

});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

function setUser(data) {
  let queryString = `SELECT ud.* FROM user_details as ud where ud.login = '${data}'`;
  let result = dbService.queryDatabase(queryString)
    .then((data) => user = new User(data.token, data.id, data.login))
    .catch((res) => printMessage('error account', res));
}

// function queryDatabase(queryString) {
//   let resultQuery = null; 
//   const client = new pg.Client(connectionString);
//   client.connect();

//   const query = client.query(queryString, (err, result) => {
//     if (err) printMessage('err', err);
//     // if (result) console.log(result);
//   });
//   query.on('row', (row) => {
//     resultQuery = row;
//     printMessage('resultQuery', resultQuery)
//   })
//   query.on('end', () => {
//     client.end();
//   })
//   console.log( 'resultQuery', resultQuery);
//   return resultQuery;
// }

app.listen(3000);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}

function printMessage(name, obj) {
  // console.dir('\n', { depth: null, colors: true })
  console.dir(name, { depth: null, colors: true });
  console.dir(obj, { depth: null, colors: true });

}

const onError = (res) => printMessage('onError', res);



// uzyteczny kod
  // request({
  //   headers: { 'user-agent': 'node.js' },
  //   uri: 'https://api.github.com/users/wasylewski/repos',
  //   method: 'GET'
  // }, (error, response, body) => {

  //   let obj = JSON.parse(body);

  //   obj.forEach((item) => {
  //     // console.log(item.id); // git project id
  //     // console.log(item.name) // project name
  //     // console.log(item.full_name) // full project name
  //     // console.log(item.html_url) //  html_url
  //     // console.log(item.description) // description
  //     // console.log(item.url) // api-url

  //     let queryString = `UPDATE repositories set git_project_id='${item.id}', project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}'
  //     where EXISTS (SELECT * FROM repositories WHERE repositories.git_project_id = ${item.id});

  //     INSERT INTO repositories (git_project_id, project_name, full_project_name, html_url, description, api_url)
  //     SELECT '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
  //     WHERE NOT EXISTS (SELECT 1 FROM repositories WHERE repositories.git_project_id = ${item.id});`

  //     queryDatabase(queryString);

  //   })

  //   res.render('repositories', { body: body });
  // })



    // get(url) {
  //   this.request({
  //     headers: { 'user-agent': 'node.js' },
  //     uri: url,
  //     method: 'GET'
  //   }, (error, response, body) => {
  //     if (error) return null;
  //     return body;
  //   })
  // }