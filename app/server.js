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
let coForEach = require('co-foreach');
let Q = require('q');
var co = require('co');
let RequestClient = require('./requestService');
let requestClient = new RequestClient();
let User = require('./user.js');
let DBService = require('./dbService');
let dbService = new DBService();

const ensureAuthenticated = require('./middlewares/ensureAuthenticated');

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

app.get('/account', ensureAuthenticated, co.wrap(function* (req, res) {
  try {
    const user = req.user;

    let queryString = `UPDATE user_details set login='${user.login}', github_user_id=${user.id}, html_url='${user.html_url}', repos_url='${user.repos_url}', token='${token}' where EXISTS (SELECT * FROM user_details WHERE user_details.github_user_id = ${user.id});
        INSERT INTO user_details (login, github_user_id, html_url, repos_url, token)  
        SELECT '${user.login}', ${user.id}, '${user.html_url}', '${user.repos_url}', '${token}'
        WHERE NOT EXISTS (SELECT 1 FROM user_details WHERE user_details.github_user_id = ${user.id});`

    yield dbService.queryDatabase(queryString);

    res.render('account', { user, title: 234 });
  } catch (e) {
    printMessage('got error', e);
  }
}));



app.get('/repositories', ensureAuthenticated, (req, res) => {

  const storeRepositories = (body) => {
    let repositories = JSON.parse(body);
    coForEach(repositories, function* (item, index) {
      let queryString = `UPDATE repositories set git_project_id='${item.id}', project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}'
          where EXISTS (SELECT * FROM repositories WHERE repositories.git_project_id = ${item.id});

          INSERT INTO repositories (git_project_id, project_name, full_project_name, html_url, description, api_url)
          SELECT '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
          WHERE NOT EXISTS (SELECT 1 FROM repositories WHERE repositories.git_project_id = ${item.id});`

      yield dbService.queryDatabase(queryString);

    })
    res.render('repositories', { repositories: repositories });
  }

  try {
    requestClient.get(`https://api.github.com/users/${req.user.username}/repos`)
      .then(storeRepositories)
  } catch (e) {
    printMessage('got error', e);
  }

});


app.get(`/repositories/issues/:name`, ensureAuthenticated, (req, res) => {

  const storeIssues = (body) => {
    let issues = JSON.parse(body);

    coForEach(issues, function* (item, index) {
      let queryString = `UPDATE issues set url='${item.url}', repository_url='${item.repository_url}', git_issue_id='${item.id}', title='${item.title}', user_id='${item.description}', user_id='${user.userId}' body='${item.body}'
        WHERE EXISTS(SELECT * FROM issues WHERE issues.git_issue_id=${item.id});

        INSERT INTO issues (url, repository_url, git_issue_id, title, user_id, user_id, body)
        SELECT '${item.url}', '${item.repository_url}', ${item.id}, '${item.title}', '${item.description}', ${user.userId}, '${item.body}'
        WHERE NOT EXISTS (SELECT 1 FROM issues WHERE issues.git_issue_id=${item.id});`

      yield dbService.queryDatabase(queryString);
    })
    res.render('issues', { issues: issues })
  }

  try {
    requestClient.get(`https://api.github.com/repos/${req.user.username}/${req.params.name}/issues`)
      .then(storeIssues);

  } catch (e) {
    printMessage('got error', e);
  }

});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

function setUser(data) {
  let queryString = `SELECT ud.* FROM user_details as ud where ud.login = '${data}'`;
  co(function* () {
    let result = Promise.resolve(dbService.queryDatabase(queryString))
      .then((data) => {
        console.log(data);
        // yield data;
      })
    // console.log(result);
    yield result;
  })
    .then((data) => {
      printMessage('setting user'); console.log(data);
      user = new User(data.token, data.id, data.login)
      printMessage('user setup');
    })
    .catch((err) => printMessage('user is giving errors', err));

  // let result = dbService.queryDatabase(queryString)
  //   .then((data) => user = new User(data.token, data.id, data.login))
  //   .catch((res) => printMessage('error account', res));
}

// function setUser(data) {
//   let queryString = `SELECT ud.* FROM user_details as ud where ud.login = '${data}'`;
//   let result = dbService.queryDatabase(queryString)
//     .then((data) => user = new User(data.token, data.id, data.login))
//     .catch((res) => printMessage('error account', res));
// }

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

function printMessage(name, obj) {
  // console.dir('\n', { depth: null, colors: true })
  console.dir(name, { depth: null, colors: true });
  if (obj) console.dir(obj, { depth: null, colors: true });

}

const onError = (res) => {
  printMessage('onError', res);
};

