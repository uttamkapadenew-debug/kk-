(() => {
  let sdk;
  let auth;
  let provider;
  let initialization;

  window.StaffHubAuth = Object.freeze({
    initialize(onChange) {
      if (initialization) return initialization;
      initialization = (async () => {
        if (!['http:', 'https:'].includes(location.protocol)) {
          throw new Error('Open StaffHub from its website to sign in with Google.');
        }
        const config = window.STAFFHUB_FIREBASE_CONFIG;
        if (!config?.apiKey || !config?.authDomain || !config?.projectId) {
          throw new Error('Google sign-in has not been configured for this website.');
        }
        const [appSdk, authSdk] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
        ]);
        sdk = authSdk;
        const app = appSdk.initializeApp(config);
        // Keep the original behavior: request sign-in whenever the page opens.
        auth = sdk.initializeAuth(app, {
          persistence: sdk.inMemoryPersistence,
          popupRedirectResolver: sdk.browserPopupRedirectResolver
        });
        provider = new sdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await auth.authStateReady();
        sdk.onAuthStateChanged(auth, onChange);
      })();
      return initialization;
    },
    signIn() {
      if (!auth) throw new Error('Google sign-in is still loading. Try again shortly.');
      // Call directly from the button click so browsers permit the popup.
      return sdk.signInWithPopup(auth, provider);
    },
    signOut() {
      return auth ? sdk.signOut(auth) : Promise.resolve();
    }
  });
})();
