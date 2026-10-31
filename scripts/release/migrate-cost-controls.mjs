// Runs only after the coordinated release and identity smoke test succeed.
// A trigger-type change requires a new function name before retiring the old one.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const manifest = JSON.parse(await readFile('tmp/release/manifest.json', 'utf8'));
const expected = { staging: 'pluto-staging-92eb7', production: 'pluto-9b6ca' };
if (expected[manifest.environment] !== manifest.projectId || process.env.DEPLOY_PROJECT_ID !== manifest.projectId ||
    !/^[a-f0-9]{40}$/.test(manifest.revision)) throw Error('Cost migration project/revision mismatch.');
const credential = applicationDefault();
initializeApp({ projectId: manifest.projectId, credential });
const db = getFirestore();
const base = `https://cloudfunctions.googleapis.com/v2/projects/${manifest.projectId}/locations/us-central1/functions`;
async function api(url, method = 'GET') {
  const {access_token} = await credential.getAccessToken();
  const response = await fetch(url, {method, headers:{Authorization:`Bearer ${access_token}`}, signal:AbortSignal.timeout(60000)});
  if(response.status===404 && method==='GET') return null;
  if(!response.ok) throw Error(`Function migration request failed (${response.status}).`);
  return response.json();
}
const old=await api(`${base}/ticketingRecoveryWorker`);
let drainSeconds=0;
for(const name of ['publicSite','ticketingRecoveryRequestWorker','ticketingHealthMaintenance']) {
  const fn = await api(`${base}/${name}`);
  if(fn?.state!=='ACTIVE' || fn.serviceConfig?.environmentVariables?.PLUTO_RELEASE_SHA!==manifest.revision)
    throw Error(`Replacement runtime is not active at the selected revision: ${name}`);
  if(name==='publicSite') drainSeconds=Number(fn.serviceConfig.timeoutSeconds)||60;
}
// On the one-time cutover, old API requests can enqueue legacy recovery and
// old email workers can create recovery tokens without TTL metadata. Their
// audited maximum timeout is 540 seconds. Drain them before both migrations.
drainSeconds=old ? Math.max(drainSeconds,540) : 0;
console.log(`Allowing ${drainSeconds+5}s for requests on the prior API revision to drain.`);
for(let remaining=drainSeconds ? drainSeconds+5 : 0;remaining>0;remaining-=30)
  await new Promise(done=>setTimeout(done,Math.min(30,remaining)*1000));
const migrated=[];
for(const [healthId,lane] of Object.entries({maintenance:'payments','maintenance-communications':'communications','maintenance-emails':'emails'})) {
  await db.runTransaction(async tx=>{
    const legacy=(await tx.get(db.collection('ticketingHealth').doc(healthId))).data();
    if(!legacy?.requestId || legacy.migratedRecoveryRequestId===legacy.requestId) return;
    const key=createHash('sha256').update(`${healthId}:${legacy.requestId}`).digest('hex');
    const ref=db.collection('ticketingRecoveryRequests').doc(`legacy_${key}`);
    if(!(await tx.get(ref)).exists) tx.create(ref,{lane,status:'pending',requestedAt:legacy.requestedAt||Date.now(),migrated:true});
    tx.update(db.collection('ticketingHealth').doc(healthId),{migratedRecoveryRequestId:legacy.requestId});
    migrated.push(healthId);
  });
}
if(old) {
  const trigger=old.eventTrigger;
  if(trigger?.eventType!=='google.cloud.firestore.document.v1.written' ||
     !trigger.eventFilters?.some(f=>f.attribute==='document' && f.value==='ticketingHealth/{healthId}'))
    throw Error('Legacy function trigger differs from the audited health trigger; refusing deletion.');
  const operation=await api(`${base}/ticketingRecoveryWorker`,'DELETE');
  for(let attempt=0;attempt<100;attempt++) {
    const state=await api(`https://cloudfunctions.googleapis.com/v2/${operation.name}`);
    if(state?.error) throw Error('Legacy worker deletion failed.');
    if(state?.done) break;
    if(attempt===99) throw Error('Legacy worker deletion is still pending.');
    await new Promise(done=>setTimeout(done,3000));
  }
  if(await api(`${base}/ticketingRecoveryWorker`)) throw Error('Legacy worker still exists.');
}
await writeFile('tmp/release/cost-migration.json',JSON.stringify({revision:manifest.revision,projectId:manifest.projectId,migrated,legacyWorkerRemoved:true},null,2));
console.log('Verified replacement workers, preserved legacy recovery requests and retired the health-write trigger.');
