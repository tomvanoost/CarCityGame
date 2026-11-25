#!/bin/sh
# Writes /config.js from environment variables at container start, so the
# Firebase config can be changed with `fly secrets set` without rebuilding.
cat > /usr/share/nginx/html/config.js <<CFG
window.CARCITY_CONFIG = {
  firebase: {
    apiKey: "${FIREBASE_API_KEY}",
    authDomain: "${FIREBASE_AUTH_DOMAIN}",
    databaseURL: "${FIREBASE_DATABASE_URL}",
    projectId: "${FIREBASE_PROJECT_ID}",
    appId: "${FIREBASE_APP_ID}"
  }
};
CFG
