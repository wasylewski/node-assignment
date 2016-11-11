'use strict'

const util = require('util');
const express = require('express');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bodyParser = require('body-parser');
const partials = require('express-partials');
const methodOverride = require('method-override');
const session = require('express-session');
const request = require('request');
const http = require('http');
const coForEach = require('co-foreach');
const Q = require('q');
var co = require('co');
const RequestClient = require('./requestService');
const requestClient = new RequestClient();
const User = require('./user.js');
const DBService = require('./dbService');
const dbService = new DBService();

const pgp = require('pg-promise')();
let db = pgp('postgresql://postgres:postgres@localhost/githubDB');


const ensureAuthenticated = require('./middlewares/ensureAuthenticated');


const GITHUB_CLIENT_ID = '5301c2ab0614cc72f15c';
const GITHUB_CLIENT_SECRET = 'be52db4573cf12873a57117e59848307e0f0a37d';

passport.serializeUser((user, done) => done(null, user));

passport.deserializeUser((obj, done) => done(null, obj));


passport.use(new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: "http://127.0.0.1:3000/auth/github/callback"
},
  (accessToken, refreshToken, profile, done) => {

    const queryString = `select ud.*, roles.name as rolename from user_details as ud, roles
                      where ud.login = '${profile._json.login}'
                      and roles.id = ud.role_id`;

    const setUserProfile = (user) => {
      user.token = accessToken;
      process.nextTick(() => { console.log(user);
        return done(null, user);
      });
    }

    db.one(queryString, [true])
      .then(setUserProfile)
      .catch((err) => onError(err, res));
      
      
  }
));

passport.use(new LocalStrategy( co.wrap(function*(username, password, done) {

  const queryString = `SELECT ud.*, roles.name as rolename from user_details as ud, roles 
      where (ud.login = '${username}'
      and ud.password = '${password}')
      and roles.id = ud.role_id;`;

  const returnVerification = (user) => { 
    if (!user) return done(null, false);
    return done(null, user);
  } 

  db.one(queryString)
    .then(returnVerification);

})));


// configure Express
let app = express();
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

app.get('/', (req, res) => {
  req.session.user = req.user;

  const displayRepositories = (results) => { 
    results = JSON.parse(results);
    res.render('index', { user: req.user, repositories: results});
  }

  requestClient.get(`https://api.github.com/repositories?since=364`)
    .then(displayRepositories)
    .catch((e) => printMessage('got error', e))

});

app.get('/login', (req, res) => {
  let errorMessage = req.session.messages;
  req.session.messages = [];
  res.render('login', { login_errors: errorMessage || [] });
});

app.post('/login-user', passport.authenticate('local', { 
    successRedirect: '/', 
    failureRedirect: '/login', 
    failureMessage: 'Invalid username or password' 
  })

);

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }), (req, res) => { /*tutaj nigdy nie bedziemy, idz do callback*/ });

app.get('/auth/github/callback', passport.authenticate('github', { 
  failureRedirect: '/login' 
}), (req, res) => {
  res.redirect('/');
});

app.get('/account', ensureAuthenticated, co.wrap(function* (req, res) {
  const user = req.session.user;

  const queryPackages = `SELECT * FROM packages`;
  const queryUserPackages = `SELECT packages.name FROM packages, user_details
                          WHERE packages.id = user_details.package_id
                          AND user_details.id = ${user.id};`

  function* getData(t) {
    let packages = yield t.many(queryPackages);
    let userPackages = yield t.many(queryUserPackages);
    return {
      packages: packages,
      userPackages : userPackages
    }
  } 

  const render = (data) =>  res.render('account', { user, title: 'Moje konto', roleName: user.rolename, packages: data.packages, userPackages: data.userPackages });
  
  db.task(getData)
    .then(render);

}));

app.post('/account/acquire-package', ensureAuthenticated, co.wrap(function*(req, res) {
  let formDetails = req.body;
  let user = req.session.user;

  const render = () => res.send(`user ${user.login} acquired package ${formDetails.package_id}`)    

  const queryString = `UPDATE user_details set package_id = ${formDetails.package_id}`;

  db.none(queryString)
  .then(render)
  .catch((err) => onError(err, res));
  
}));

app.get('/repositories', ensureAuthenticated, (req, res) => {

  const user = req.session.user;

  const storeRepositories = (body) => { 
    let repositories = JSON.parse(body);

    db.tx(function(t) {
      let queries = [];

      repositories.forEach((item) => {
        const queryString = t.none(`INSERT INTO repositories (user_id, git_project_id, project_name, full_project_name, html_url, description, api_url)
          SELECT '${user.id}', '${item.id}','${item.name}', '${item.full_name}', '${item.html_url}', '${item.description}', '${item.url}'
          ON CONFLICT (git_project_id) DO UPDATE
          SET project_name='${item.name}', full_project_name='${item.full_name}', html_url='${item.html_url}', description='${item.description}', api_url='${item.url}';`)

        queries.push(queryString); 
      })

      return t.batch(queries);
    })
    .then(() => res.render('repositories', { repositories: repositories }))
    .catch((err) => onError(err, res));
  }

  requestClient.get(`https://api.github.com/users/${user.login}/repos`)
    .then(storeRepositories)
    .catch((err) => onError(err, res));    
   
});


app.get(`/repositories/issues/:name`, ensureAuthenticated, (req, res) => {

  const user = req.session.user;

  const storeIssues = (body) => { 
    let issues = JSON.parse(body); 

    coForEach(issues, function* (item, index) {
      const queryString = `INSERT INTO issues (url, repository_url, git_issue_id, title, user_id, body)
        SELECT '${item.url}', '${item.repository_url}', ${item.id}, '${item.title}', ${user.id}, '${item.body}'
        ON CONFLICT (git_issue_id) DO UPDATE
        SET url='${item.url}', repository_url='${item.repository_url}', git_issue_id='${item.id}', title='${item.title}', user_id='${user.id}', body='${item.body}'`;

        return yield db.none(queryString)
        .catch((err) => onError(err, res))

    })
    .then(()=> res.render('issues', { issues: issues }))
    .catch((err) => onError(err, res))
    
  }

  requestClient.get(`https://api.github.com/repos/${user.login}/${req.params.name}/issues`)
    .then(storeIssues)
    .catch(onError);

});

app.get(`/packages`, ensureAuthenticated, co.wrap(function*(req, res) { 
  
  const render = (array) => res.render('packages', { packages: array });

  const queryString = `SELECT * FROM packages;`
  yield dbService.queryDatabase(queryString)
    .then(render)
    .catch((err) => onError(err, res));

}));

app.post(`/create-package`, ensureAuthenticated, co.wrap(function*(req, res){

  let formDetails = req.body;
  const queryString = `INSERT INTO public.packages (name, price) VALUES('${formDetails.name}', ${formDetails.price});`;

  const render = () => res.send('package succesfully added');

  dbService.queryDatabase(queryString)
    .then(render)
    .catch((err) => onError(err, res));
    

}));


app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.listen(3000);

function printMessage(name, obj) {
  console.dir(name, { depth: null, colors: true });
  if (obj) {
     console.dir(obj, { depth: null, colors: true });
  } 

}

const onError = (e, res) => { 
  printMessage('onError', e);
  res.send(e);
};

