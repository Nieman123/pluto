// This local account is fictional and exists only in the Firebase emulators.
const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {readFileSync}=require('node:fs');
const {randomBytes}=require('node:crypto');
if(process.env.GCLOUD_PROJECT!=='demo-pluto-ticketing' || process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8185' || process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9095') throw Error('Emulator-only screenshots');
const backend=createRequire(resolve('functions/package.json'));
backend('firebase-admin/app').initializeApp({projectId:'demo-pluto-ticketing',storageBucket:'demo-pluto-ticketing.appspot.com'});
const db=backend('firebase-admin/firestore').getFirestore();
const auth=backend('firebase-admin/auth').getAuth();
const {Catalog}=require('../../functions/lib/ticketing/catalog');
const {Orders}=require('../../functions/lib/ticketing/orders');
const {fixture}=require('../../functions/test/ticketing-fixture.cjs');
(async()=>{
  const uid='store-demo-member',admin='store-demo-admin',email='alex@pluto-demo.invalid';
  await auth.createUser({uid,email,password:'Local-store-screenshot-2026!',displayName:'Alex',emailVerified:true});
  await db.collection('adminUsers').doc(admin).set({role:'admin'});
  await db.collection('userProfiles').doc(uid).set({displayName:'Alex',homeCity:'Asheville, NC',favoriteGenre:'House & techno',bio:'Here for the music and the community.',pointsBalance:350,lifetimePoints:350,eventsAttended:4});
  const catalog=new Catalog(),draft=fixture();
  draft.title='Manafest 2027';draft.slug='manafest-store-demo';draft.subtitle='Music, camping and community in the woods.';
  draft.venueVisibility='public';draft.venueName='The woodland stage';draft.address='';draft.promos=[];
  const year=new Date().getUTCFullYear()+1;
  draft.startAt=`${year}-06-18T20:00:00.000Z`;draft.admissionStartsAt=draft.startAt;draft.endAt=`${year}-06-21T04:00:00.000Z`;
  draft.offers=[{...draft.offers[0],name:'Weekend admission',unitAmount:0,validFrom:draft.startAt,validUntil:draft.endAt,salesEnd:draft.endAt}];
  const hero=await catalog.upload('store-manafest',readFileSync('assets/gallery/manafest-2026/manafest-2026-night-stage.webp').toString('base64'),admin);
  draft.hero={...hero,alt:'Music and lights at the woodland stage'};
  await catalog.save('store-manafest',draft,0,admin);await catalog.publish('store-manafest','publish',1,admin);
  await db.collection('currentEvents').doc('store-orbit').set({title:'Into the Orbit',details:'House, techno and familiar faces.\nAsheville, NC',ticketUrl:'http://127.0.0.1:4173/events/manafest-store-demo',flyerDataUrl:'data:image/webp;base64,'+readFileSync('web/gallery/manafest-2026-pink-stage.webp').toString('base64'),isActive:true,sortOrder:1,registrationMode:'rsvp'});
  const order=await new Orders().checkout({eventId:'store-manafest',accessKey:randomBytes(32).toString('hex'),items:[{offerId:'weekend',quantity:1}],name:'Alex',email,promoCode:''},{uid,email,email_verified:true});
  if(!['paid','confirmed'].includes(order.status)) throw Error('Demo admission not issued: '+order.status);
  for(const [id,name,description,cost,category] of [
    ['stickers','Pluto sticker pack','A little Pluto for your everyday orbit.',100,'Merch'],
    ['tee','Pluto tee','Rep your dance-floor community.',300,'Merch'],
    ['experience','Event admission','Put your Pluto Points toward your next gathering.',500,'Tickets']]) {
    await db.collection('rewardItems').doc(id).set({name,description,pointsCost:cost,category,isActive:true,inventory:20,imageDataUrl:''});
  }
  console.log('Fictional member, local ticket, events and rewards ready.');
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1)});
