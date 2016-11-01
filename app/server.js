'use strict'

let express = require('express');
let passport = require('passport');
let bodyParser = require('body-parser');
let GitHubStrategy = require('passport-github2').Strategy;
let partials = require('express-partials');
let methodOverride = require('method-override');
let session = require('express-session');
let request = require('request');
let http = require('http');
let pg = require('pg');

//postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
let connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost/githubDB';



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
    console.log('accessToken', accessToken);
    // console.log('refreshToken', refreshToken);
    console.log(profile);

    process.nextTick(() => {
      return done(null, profile);
    });
  }
));

let user = null;
////

var app = express();

console.log(__dirname);

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
  user = req.user._json;

// strzel tutaj po github user id dodatkowo 

  let queryString = `UPDATE user_details set login='${user.login}', github_user_id=${user.id}, html_url='${user.html_url}', repos_url='${user.repos_url}' where EXISTS (SELECT * FROM user_details WHERE user_details.github_user_id = ${user.id});
      INSERT INTO user_details (login, github_user_id, html_url, repos_url)  
      SELECT '${user.login}', ${user.id}, '${user.html_url}', '${user.repos_url}'
      WHERE NOT EXISTS (SELECT 1 FROM user_details WHERE user_details.github_user_id = ${user.id});`

  queryDatabase(queryString);

  res.render('account');
});

app.get('/repositories', ensureAuthenticated, (req, res) => {

  request({
    headers: { 'user-agent': 'node.js' },
    uri: 'https://api.github.com/users/wasylewski/repos',
    method: 'GET'
  }, (error, response, body) => {

    let obj = JSON.parse(body);

    obj.forEach((item) => {
      console.log(item.id); // git project id
      console.log(item.name) // project name
      console.log(item.full_name) // full project name
      console.log(item.html_url) //  html_url
      console.log(item.description) // description
      console.log(item.url) // api-url

      let queryString = `UPDATE repositories set git_project_id='${item.id}', project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}'
      where EXISTS (SELECT * FROM repositories WHERE repositories.git_project_id = ${item.id});

      INSERT INTO repositories (git_project_id, project_name, full_project_name, html_url, description, api_url)
      SELECT '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
      WHERE NOT EXISTS (SELECT 1 FROM repositories WHERE repositories.git_project_id = ${item.id});`

      queryDatabase(queryString);

    })

    res.render('repositories', { body: body });
  })
});

app.get('/issues', ensureAuthenticated, (req, res) => {
  request({
    headers: { 'user-agent': 'node.js' },
    uri: 'https://api.github.com/repos/wasylewski/node-assignment/issues',
    method: 'GET'
  }, (error, response, body) => {
    res.render('issues', { body: body });

    let obj = JSON.parse(body);

    obj.forEach((item) => {
      console.log(item.url);
      console.log(item.repository_url);
      console.log(item.id);
      console.log(item.title);
      console.log(item.user.id); // 

    });


  });
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

function queryDatabase(queryString) {

  const client = new pg.Client(connectionString);
  client.connect();

  const query = client.query(queryString, (err, result) => {
    if (err) console.log('err err err err err err err err err ', err);
    if (result) console.log(result);
  });
  query.on('end', () => {
    client.end();
  })
}

app.listen(3000);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}


