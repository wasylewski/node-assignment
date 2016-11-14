'use strict'

const co = require('co');
const coForEach = require('co-foreach');


const RequestClient = require('./services/requestService');
const requestClient = new RequestClient();
const DBService = require('./services/dbService');
const dbService = new DBService();

module.exports = function (app, passport, db) {

//normal routes

  // show the home page
  app.get('/', (req, res) => {
    req.session.user = req.user;

    const displayRepositories = (results) => {
      results = JSON.parse(results);
      res.render('index', { user: req.user, repositories: results });
    }

    requestClient.get(`https://api.github.com/repositories?since=364`)
      .then(displayRepositories)
      .catch((e) => printMessage('got error', e))
  });

  // account section
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
        userPackages: userPackages
      }
    }

    const render = (data) => res.render('account', { user, title: 'Moje konto', roleName: user.rolename, packages: data.packages, userPackages: data.userPackages });

    db.task(getData)
      .then(render);

  }));

  // user route to acquire package
  app.post('/account/acquire-package', ensureAuthenticated, co.wrap(function* (req, res) {
    let formDetails = req.body;
    let user = req.session.user;

    const render = () => res.send(`user ${user.login} acquired package ${formDetails.package_id}`);

    const queryString = `UPDATE user_details set package_id = ${formDetails.package_id}`;

    db.none(queryString)
      .then(render)
      .catch((err) => onError(err, res));

  }));

  // user route to see repositories   
  app.get('/repositories', ensureAuthenticated, (req, res) => {

    const user = req.session.user;

    const storeRepositories = (body) => {
      let repositories = JSON.parse(body);

      db.tx(function (t) {
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

  // user route to see issues
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
        .then(() => res.render('issues', { issues: issues }))
        .catch((err) => onError(err, res))

    }

    requestClient.get(`https://api.github.com/repos/${user.login}/${req.params.name}/issues`)
      .then(storeIssues)
      .catch(onError);

  });

  // user route to see packages
  app.get(`/packages`, ensureAuthenticated, co.wrap(function* (req, res) {

    const render = (array) => res.render('packages', { packages: array });

    const queryString = `SELECT * FROM packages;`
    yield dbService.queryDatabase(queryString)
      .then(render)
      .catch((err) => onError(err, res));

  }));

  // user route to create package
  app.post(`/create-package`, ensureAuthenticated, co.wrap(function* (req, res) {

    let formDetails = req.body;
    const queryString = `INSERT INTO public.packages (name, price) VALUES('${formDetails.name}', ${formDetails.price});`;

    const render = () => res.send('package succesfully added');

    dbService.queryDatabase(queryString)
      .then(render)
      .catch((err) => onError(err, res));
  }));



  // logout
  app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
  });



  // AUTHENTICATE (FIRST LOGIN)

  // locally -------------------------
  // login    
  // show the login form
  app.get('/login', (req, res) => {
    let errorMessage = req.session.messages;
    req.session.messages = [];
    res.render('login', { login_errors: errorMessage || [] });
  });


  // process the login form
  app.post('/login-user', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureMessage: 'Invalid username or password'
  }));


  // github ------------------------

  // send to github for the authentication
  app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }), (req, res) => { /*tutaj nigdy nie bedziemy, idz do callback*/ });

  // handle the callback after github authenticated user
  app.get('/auth/github/callback', passport.authenticate('github', {
    failureRedirect: '/login'
  }), (req, res) => {
    res.redirect('/');
  });

}

// route moddleware to ensure user is still logged in  
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login');
} 

function printMessage(name, obj) {
  console.dir(name, { depth: null, colors: true });
  if (obj) {
     console.dir(obj, { depth: null, colors: true });
  } 
}

function onError (e, res) { 
  printMessage('onError', e);
  res.send(e);
};