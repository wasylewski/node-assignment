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
    profile._json.token = accessToken; 

    process.nextTick(() => {
      return done(null, profile);
    });
  }
));


// configure Express
var app = express();
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
    const user = req.user._json;
    printMessage('user', user);

    let queryString = `UPDATE user_details set login='${user.login}', github_user_id=${user.id}, html_url='${user.html_url}', repos_url='${user.repos_url}', token='${user.token}' where EXISTS (SELECT * FROM user_details WHERE user_details.github_user_id = ${user.id});
        INSERT INTO user_details (login, github_user_id, html_url, repos_url, token)  
        SELECT '${user.login}', ${user.id}, '${user.html_url}', '${user.repos_url}', '${user.token}'
        WHERE NOT EXISTS (SELECT 1 FROM user_details WHERE user_details.github_user_id = ${user.id});

        SELECT user_details.id, roles.name as roleName FROM user_details, roles
        WHERE user_details.github_user_id = ${user.id}
        AND user_details.role_id = roles.id;`;

    user.userDetails = yield dbService.queryDatabase(queryString);
    req.session.user = user;
    printMessage('user after log in', user);
    printMessage('user.userDetails', user.userDetails.rolename)
    
    res.render('account', { user, title: 'Moje konto', roleName: user.userDetails.rolename });

  } catch (e) {
    printMessage('got error', e);
  }
}));


app.get('/repositories', ensureAuthenticated, (req, res) => {

  const user = req.session.user;

  const storeRepositories = (body) => {
    let repositories = JSON.parse(body);
      // `UPDATE repositories set git_project_id='${item.id}', project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}'
      //     where EXISTS (SELECT * FROM repositories WHERE repositories.git_project_id = ${item.id});

    coForEach(repositories, function* (item, index) {
      let queryString = `INSERT INTO repositories (user_id, git_project_id, project_name, full_project_name, html_url, description, api_url)
          SELECT '${user.userDetails.id}', '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
          WHERE NOT EXISTS (SELECT 1 FROM repositories WHERE repositories.git_project_id = ${item.id});`

          printMessage(queryString);

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

  const user = req.session.user;

  const storeIssues = (body) => { 
    let issues = JSON.parse(body); 
    printMessage(issues);
    // issues.ForEach((item) => console.log(item));
      // `UPDATE issues set url='${item.url}', repository_url='${item.repository_url}', git_issue_id='${item.id}', title='${item.title}', user_id='${item.description}', user_id='${user.userId}' body='${item.body}'
      //   WHERE EXISTS(SELECT * FROM issues WHERE issues.git_issue_id=${item.id});

    coForEach(issues, function* (item, index) {
      let queryString = `INSERT INTO issues (url, repository_url, git_issue_id, title, user_id, body)
        SELECT '${item.url}', '${item.repository_url}', ${item.id}, '${item.title}', ${user.userDetails.id}, '${item.body}'
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

app.listen(3000);

function printMessage(name, obj) {
  console.dir(name, { depth: null, colors: true });
  if (obj) console.dir(obj, { depth: null, colors: true });

}

const onError = (res) => {
  printMessage('onError', res);
};

