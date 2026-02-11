const admin = require("firebase-admin");

// Initialize Firebase Admin SDK. Prefer providing credentials via
// GOOGLE_APPLICATION_CREDENTIALS env var (path to service account JSON) or
// FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON) for containers.
function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return admin.app();

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Fix for Railway/cloud: env var UI can mangle the JSON.
    // Strategy: extract individual fields instead of parsing raw JSON directly.
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      // Railway converts literal \n into real newlines which creates invalid
      // escape sequences like \j, \p etc. Fix: replace all backslash-followed
      // by non-JSON-escape characters, then re-parse.
      let fixed = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      // First, convert real newlines to literal \n
      fixed = fixed.replace(/\r?\n/g, '\\n');
      // Fix bad escape sequences: \j \p \c etc -> just the character
      fixed = fixed.replace(/\\([^"\\\/bfnrtu])/g, '$1');
      serviceAccount = JSON.parse(fixed);
    }
    // Ensure private_key has actual newlines (PEM format requires them)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    // SDK will pick up GOOGLE_APPLICATION_CREDENTIALS if set
    admin.initializeApp();
  }

  return admin.app();
}

module.exports = initFirebaseAdmin();
