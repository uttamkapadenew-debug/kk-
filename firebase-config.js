// Public Firebase web configuration. This is not an administrator credential.
window.STAFFHUB_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyCLw_UM6k0vTxv7hsv3QHAO5wX_mfgPZxY',
  authDomain: 'kk-staffhub.firebaseapp.com',
  appId: '1:333979725526:web:35ed3be13ba53619a7e377',
  projectId: 'kk-staffhub',
  measurementId: 'G-09VJEFWKKS',
  messagingSenderId: '333979725526',
  storageBucket: 'kk-staffhub.firebasestorage.app'
});

// Pending the owner's access choice. An empty list keeps the app locked.
// This controls the local app UI, not Firebase server authorization.
// Any future cloud database must enforce access using server-side rules.
window.STAFFHUB_ACCESS = Object.freeze({
  allowAllGoogleAccounts: false,
  allowedEmails: ['uttamkapadenew@gmail.com'],
  legacyOwnerEmail: 'uttamkapadenew@gmail.com'
});
