/**
 * Vercel's CommonJS Express entrypoint.
 *
 * Keep the production app in app.mjs and forward requests here so local and
 * serverless deployments use the same middleware, routes, and error handling.
 */
const express = require('express');

const app = express();
let activeAppPromise;

app.use((req, res, next) => {
  activeAppPromise ||= import('./app.mjs').then(({ default: activeApp }) => activeApp);
  activeAppPromise
    .then((activeApp) => activeApp(req, res, next))
    .catch(next);
});

module.exports = app;
