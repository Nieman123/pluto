importScripts('https://www.gstatic.com/firebasejs/8.4.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.4.1/firebase-messaging.js');

// compose-web generates the same public configuration used by SSR and Flutter.
importScripts('/assets/firebase-public-config.js');
if (!self.PLUTO_FIREBASE_CONFIG) throw new Error('Missing Firebase web configuration.');
if (self.PLUTO_ENVIRONMENT !== 'emulator') {
   firebase.initializeApp(self.PLUTO_FIREBASE_CONFIG);
   const messaging = firebase.messaging();
 
   messaging.onBackgroundMessage(function(payload) {
     const notificationTitle = payload.notification.title;
     const notificationOptions = {
       body: payload.notification.body,
     };
 
     self.registration.showNotification(notificationTitle,
       notificationOptions);
   });
}
