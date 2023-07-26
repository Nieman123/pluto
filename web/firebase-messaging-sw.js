importScripts('https://www.gstatic.com/firebasejs/8.4.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.4.1/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyBLv7MumBOjUHpmAUiu9nLfhWvwmAYKorE",
    authDomain: "pluto-9b6ca.firebaseapp.com",
    projectId: "pluto-9b6ca",
    storageBucket: "pluto-9b6ca.appspot.com",
    messagingSenderId: "763906028056",
    appId: "1:763906028056:web:c1261eba96f8b0c792896d",
    measurementId: "G-Y6GBW8P032"
  };
   firebase.initializeApp(firebaseConfig);
   const messaging = firebase.messaging();
 
   messaging.onBackgroundMessage(function(payload) {
     console.log('Received background message ', payload);
 
     const notificationTitle = payload.notification.title;
     const notificationOptions = {
       body: payload.notification.body,
     };
 
     self.registration.showNotification(notificationTitle,
       notificationOptions);
   });