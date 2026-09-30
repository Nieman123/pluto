import assert from 'node:assert/strict';
import {before, after, beforeEach, test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp} from 'firebase/firestore';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required for rental rules tests.');
const backend = createRequire(resolve('functions/package.json'));
const {initializeApp, deleteApp} = backend('firebase-admin/app');
const {getFirestore} = backend('firebase-admin/firestore');
const {seedRentals} = backend('./lib/rentals-seed');
const initial=JSON.parse(await readFile('assets/rentals/initial-inventory.json','utf8'));
const projectId='demo-pluto-rentals';
let env, adminApp, db;
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{rules:await readFile('firestore.rules','utf8')}});
  adminApp=initializeApp({projectId},'rental-rules'); db=getFirestore(adminApp);
});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{ await setDoc(doc(ctx.firestore(),'adminUsers/admin'),{role:'admin'}); });
});
after(async()=>{ await db?.terminate(); if(adminApp)await deleteApp(adminApp); await env?.cleanup(); });
const data=()=>{const {id,...item}=initial[0]; return {...item,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};};
const firestore=(uid)=>uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
test('admins can manage pricing, visibility, and deletion; non-admin writes are denied',async()=>{
  const admin=firestore('admin'); const ref=doc(admin,'rentalItems/test');
  await assertSucceeds(setDoc(ref,data()));
  await assertSucceeds(updateDoc(ref,{priceMode:'price',priceCents:2550,priceUnit:'per day',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(ref,{isActive:false,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(firestore(),'rentalItems/anon'),data()));
  await assertFails(setDoc(doc(firestore('member'),'rentalItems/member'),data()));
  await assertFails(deleteDoc(doc(firestore('member'),'rentalItems/test')));
  await assertSucceeds(deleteDoc(ref));
});
test('public visitors can query active listings but cannot read hidden listings or import state',async()=>{
  const admin=firestore('admin');
  await setDoc(doc(admin,'rentalItems/visible'),data());
  await setDoc(doc(admin,'rentalItems/hidden'),{...data(),isActive:false});
  await setDoc(doc(admin,'rentalSettings/initialInventory'),{seededAt:serverTimestamp()});
  const publicDb=firestore();
  await assertSucceeds(getDoc(doc(publicDb,'rentalItems/visible')));
  await assertFails(getDoc(doc(publicDb,'rentalItems/hidden')));
  await assertFails(getDoc(doc(publicDb,'rentalSettings/initialInventory')));
  await assertFails(getDocs(collection(publicDb,'rentalItems')));
  const result=await assertSucceeds(getDocs(query(collection(publicDb,'rentalItems'),where('isActive','==',true))));
  assert.equal(result.size,1);
  assert.equal((await getDocs(collection(admin,'rentalItems'))).size,2);
});
test('invalid prices, quantities, modes, URLs, and timestamps are rejected even for admins',async()=>{
  const admin=firestore('admin');
  for(const bad of [{priceMode:'price',priceCents:-1},{priceMode:'price',priceCents:1.5},{priceMode:'quote',priceCents:100},{priceMode:'unknown'},{priceMode:'price',priceCents:null},{quantity:0},{quantity:1.5},{title:''},{productUrl:'javascript:alert(1)'},{imageUrl:'data:image/png,invalid'},{updatedAt:new Date(0)}])
    await assertFails(setDoc(doc(admin,'rentalItems/invalid'),{...data(),...bad}));
  await assertSucceeds(setDoc(doc(admin,'rentalItems/zero-price'),{...data(),priceMode:'price',priceCents:0}));
});
test('admin starter import matches the real rules and can create its transaction marker',async()=>{
  const admin=firestore('admin');
  for(const {id,...item} of initial) await assertSucceeds(setDoc(doc(admin,`rentalItems/${id}`),{...item,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(doc(admin,'rentalSettings/initialInventory'),{seededAt:serverTimestamp()}));
});
test('backend seed preserves existing edits and never resurrects deleted inventory',async()=>{
  await db.collection('rentalItems').doc(initial[0].id).set({...initial[0],title:'Previously edited item'});
  const first=await seedRentals(db,initial);
  assert.equal(first.created.length,5);
  assert.equal((await db.collection('rentalItems').doc(initial[0].id).get()).data().title,'Previously edited item');
  await db.collection('rentalItems').doc(initial[1].id).delete();
  const second=await seedRentals(db,initial);
  assert.equal(second.alreadySeeded,true);
  assert.equal((await db.collection('rentalItems').doc(initial[1].id).get()).exists,false);
});
test('public rentals route reads Firebase edits and excludes hidden listings',async()=>{
  process.env.GCLOUD_PROJECT=projectId; process.env.PUBLIC_SITE_PREVIEW='true';
  const publicApp=initializeApp({projectId});
  await seedRentals(db,initial);
  await db.collection('rentalItems').doc(initial[0].id).update({title:'Custom rental from Firebase',priceMode:'price',priceCents:7500,priceUnit:'per day'});
  await db.collection('rentalItems').doc(initial[1].id).update({isActive:false});
  const {app}=backend('./lib/index'); const server=app.listen(0,'127.0.0.1');
  try {
    await new Promise(resolve=>server.once('listening',resolve));
    const response=await fetch(`http://127.0.0.1:${server.address().port}/rentals`);
    const html=await response.text(); assert.equal(response.status,200);
    assert.match(html,/Custom rental from Firebase/); assert.match(html,/\$75\.00/);
    assert.doesNotMatch(html,/<h4[^>]*>BASSBOSS VS-21/);
    assert.equal((html.match(/<article class="rental-card"/g)||[]).length,5);
  } finally { await new Promise(resolve=>server.close(resolve)); await getFirestore(publicApp).terminate(); await deleteApp(publicApp); }
});
