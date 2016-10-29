'use strict'

let express = require('express');
let passport = require('passport');
let bodyParser = require('body-parser');
let GitHubStrategy = require('passport-github2').Strategy;
let partials = require('express-partials');
let methodOverride = require('method-override');
let session = require('express-session');


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

app.get('/account', ensureAuthenticated, (req, res) => {
  res.locals.user = (req.user);
  res.render('account');
  // console.log('user', req);
});

app.get('/login', (req, res) => {
  res.render('login', { user: req.user });
  // console.log(req.user);
});

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }), (req, res) => { });

app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/login' }), (req, res) => {
  // console.log('redirecting to /\n\n');
  res.redirect('/account');
});

app.get('/user/repos', passport.authenticate('github', { scope: ['user:email'] }), (req, res) => {
  console.log('list-repos')
  console.log('req req req req req req req req req req req req req req ', req);
  console.log('res res res res res res res res res res res res res res ', res)

  // app.get('/user/repos', (req, res) => {
  //   console.log('req req req req req req req req req req req req req req ', req);
  //   console.log('res res res res res res res res res res res res res res ', res)
  //   // res.send('hello world');
  //   res.render('repositories');

  // })
  // res.render('repositories', { repo: req.} ))
  // res.render('repositories');
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.listen(3000);

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  // console.log('user lacks autentication\n\n');
  res.redirect('/login');
}


