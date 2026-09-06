// ============================================================
// Firebase Configuration
// ============================================================
// IMPORTANT: Replace ALL placeholder values below with your
// actual Firebase project configuration.
//
// To get your config:
// 1. Go to https://console.firebase.google.com
// 2. Select your project (or create one)
// 3. Click the gear icon → Project settings
// 4. Under "Your apps", click the web icon (</>)
// 5. Register your app and copy the config object
//
// See README.md for detailed setup instructions.
// ============================================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ============================================================
// Initialize Firebase
// ============================================================
firebase.initializeApp(firebaseConfig);

// Firebase service references (used throughout the app)
const db = firebase.firestore();
const rtdb = firebase.database();
const auth = firebase.auth();

// Enable Firestore offline persistence for better UX
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence unavailable: multiple tabs open.');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not supported by this browser.');
    }
});
