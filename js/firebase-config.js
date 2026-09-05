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
    apiKey: "AIzaSyB1c2D3e4F5g6H7i8J9kLmNoPqRsTuVwXy",
    authDomain: "my-carpool-tracker.firebaseapp.com",
    databaseURL: "https://my-carpool-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "my-carpool-tracker",
    storageBucket: "my-carpool-tracker.firebasestorage.app",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abc123def456ghi789"
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
