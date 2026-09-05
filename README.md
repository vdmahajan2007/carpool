# 🚗 Carpool Expense & Live Location Tracker

A web-based carpool management application designed for groups to track shared trips, calculate expenses seamlessly, and share live location with passengers.

## Features
- Shared trip tracking and logging
- Expense calculation per passenger
- Settlement and payment tracking
- Real-time GPS location sharing with passengers
- Responsive web interface accessible anywhere
- Offline support and anonymous authentication via Firebase

## Screenshots
Coming soon.

## Quick Start

### Prerequisites
- GitHub account
- Google account (for Firebase)

### Step 1: Create GitHub Repository
1. Go to github.com
2. Create new repository named `carpool`
3. Set it to Public

### Step 2: Upload Project Files
1. Download/clone this project
2. Upload all files maintaining the folder structure

### Step 3: Enable GitHub Pages
1. Go to repository Settings → Pages
2. Source: Deploy from a branch
3. Branch: main, folder: / (root)
4. Save
5. Your site will be at: `https://YOUR_USERNAME.github.io/carpool/`

### Step 4: Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Create a project"
3. Enter project name (e.g., "my-carpool-tracker")
4. Disable Google Analytics (optional)
5. Click Create

### Step 5: Enable Authentication
1. In Firebase console, go to Authentication
2. Click Get Started
3. Go to Sign-in method tab
4. Enable "Anonymous" sign-in
5. Save

### Step 6: Create Firestore Database
1. Go to Firestore Database
2. Click Create Database
3. Select region closest to you
4. Start in test mode (we'll update rules later)
5. Click Enable

### Step 7: Create Realtime Database
1. Go to Realtime Database
2. Click Create Database
3. Select region
4. Start in locked mode
5. Go to Rules tab
6. Paste the rules from `firebase-rules/realtime-database.rules.json`
7. Click Publish

### Step 8: Update Firestore Security Rules
1. Go to Firestore Database → Rules tab
2. Paste the rules from `firebase-rules/firestore.rules`
3. Click Publish

### Step 9: Register Web App
1. In Project Settings (gear icon)
2. Under "Your apps", click the Web icon (</>) 
3. Register app with nickname "Carpool Tracker"
4. Copy the firebaseConfig object shown

### Step 10: Update Firebase Configuration
1. Open `js/firebase-config.js`
2. Replace ALL placeholder values with your actual Firebase config
3. Save and commit

### Step 11: Add GitHub Pages Domain to Firebase
1. In Firebase console → Authentication → Settings
2. Add your GitHub Pages domain to Authorized domains:
   `YOUR_USERNAME.github.io`

### Step 12: Deploy & Test
1. Push all changes to GitHub
2. Wait for GitHub Pages to deploy (1-2 minutes)
3. Open `https://YOUR_USERNAME.github.io/carpool/`
4. Allow location permission when prompted
5. The app will auto-initialize with default settings

## Project Structure
```text
carpool/
├── index.html            # Main app interface
├── track.html            # Public trip tracking page
├── README.md             # Documentation
├── css/
│   └── style.css         # Application styles
├── js/
│   ├── app.js            # Main application logic
│   ├── firebase-config.js# Firebase credentials (you must update this!)
│   └── tracking.js       # Location tracking logic
└── firebase-rules/
    ├── firestore.rules   # Firestore security rules
    └── realtime-database.rules.json # RTDB security rules
```

## Configuration
The app allows users to configure people, trip defaults, and expense settings directly from the web interface. All configurations are stored securely in Firestore and synchronized automatically.

## Firebase Free Tier (Spark Plan)
Limits provided by the free tier:
- Firestore: 50K reads/day, 20K writes/day
- RTDB: 100 simultaneous connections, 1GB stored
- Auth: Unlimited anonymous users
- **These limits are MORE than enough for personal use.**

## Privacy & Security
- Location is only shared during active trips
- Live location data is deleted after trip ends
- Trip history stored in Firestore (authenticated access only)
- No personal data is exposed publicly
- Tracking links use random IDs to prevent enumeration

## Technology Stack
| Technology     | Purpose                          |
|----------------|----------------------------------|
| HTML5 / CSS3   | Core Markup & Styling            |
| JavaScript     | Frontend Logic (Vanilla JS)      |
| Bootstrap 5    | UI Framework & Responsiveness    |
| Leaflet.js     | Maps & Interactive Tracking      |
| Firebase       | Auth, Firestore, Realtime DB     |

## License
MIT License
