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
let connectionString = process.env.DATABASE_URL || 'postgresql://postgres:mojehaslo12345678@localhost/githubDB';
const client = new pg.Client(connectionString);
client.connect();

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
    // console.log('accessToken', accessToken);
    // console.log('refreshToken', refreshToken);

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
  res.render('account');
});

app.get('/repositories', ensureAuthenticated, (req, res) => {
  request({
    headers: { 'user-agent': 'node.js' },
    uri: 'https://api.github.com/users/wasylewski/repos',
    method: 'GET'
  }, (error, response, body) => {
    // sprawdz czy te repositories sie zmienily
    // zapisz to do bazy danych
    pg.connect(connectionString, (err, client, done) => {
      console.log(err, client, done);
    });

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


  });
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.listen(3000);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
}


