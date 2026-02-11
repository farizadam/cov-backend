// myapp-backend/scripts/verifyFirebaseToken.js
const admin = require("../src/config/firebaseAdmin");
const token = process.argv[2];
if (!token) {
  console.error("Usage: node scripts/verifyFirebaseToken.js <idToken>");
  process.exit(2);
}
admin
  .auth()
  .verifyIdToken(token)
  .then((decoded) => console.log("Verified token:", decoded))
  .catch((err) => console.error("Verify failed:", (err && err.message) || err));
