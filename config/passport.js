'use strict'

const co = require('co');
const GitHubStrategy = require('passport-github2').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const GITHUB_CLIENT_ID = '5301c2ab0614cc72f15c';
const GITHUB_CLIENT_SECRET = 'be52db4573cf12873a57117e59848307e0f0a37d';

// const User = require('./user.js');

const configAuth = require('./auth');

module.exports = (passport, db) => {
  // passport session setup ==================================================
  // required for persistent login sessions
  // passport needs ability to serialize and unserialize users out of session

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  // LOCAL LOGIN
  passport.use(new LocalStrategy(co.wrap(function* (username, password, done) {

    const queryString = `SELECT ud.*, roles.name as rolename from user_details as ud, roles 
      where (ud.login = '${username}'
      and ud.password = '${password}')
      and roles.id = ud.role_id;`;

    const successVerification = (user) => done(null, user);
    const failedVerification = () => done(null, false);

    db.one(queryString)
      .then(successVerification)
      .catch(failedVerification);
  })));



  // GITHUB AUTHENTICATION
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
        process.nextTick(() => {
          console.log(user);
          return done(null, user);
        });
      }

      db.one(queryString, [true])
        .then(setUserProfile)
        .catch((err) => onError(err, res));


    }
  ));

}

