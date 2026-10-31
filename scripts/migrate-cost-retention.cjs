// Bounded, resumable migration of expiration metadata; never deletes documents.
// Defaults to a read-only plan. Payment/audit ledgers and email send tombstones
// are deliberately absent: deleting them could erase history or resend mail.
const {createRequire}=require('node:module'), {resolve}=require('node:path');
const backend=createRequire(resolve(__dirname,'../functions/package.json'));
const {Timestamp,FieldPath,getFirestore}=backend('firebase-admin/firestore');
const grants=['ticketingRsvpVerification','ticketingRsvpUpgradeAccess','ticketingRecovery','ticketingAccess','ticketingTransfers','ticketingWaitlistTokens','ticketingScannerSessions'];
const collections=[...grants,'ticketingWebhookInbox','ticketingEmailDelivery'];
function deadline(collection,data) {
  if(data.deleteAfter) return null;
  let at,days;
  if(grants.includes(collection)) {at=data.expiresAt;days=7;}
  else if(collection==='ticketingWebhookInbox' && ['done','ignored'].includes(data.status)) {at=data.completedAt;days=90;}
  else if(collection==='ticketingEmailDelivery') {at=data.receivedAt;days=90;}
  if(!Number.isSafeInteger(at) || at<=0 || at>253402300799999-days*86400000) return null;
  return Timestamp.fromMillis(at+days*86400000);
}
async function migrate(db,{apply=false,pages=10}={}) {
  const report=[];
  for(const collection of collections) {
    const checkpoint=db.collection('ticketingWorkerCursors').doc(`retention-v1-${collection}`);
    let state=(await checkpoint.get()).data()||{},scanned=0,eligible=0,changed=0;
    if(state.done) {report.push({collection,done:true,scanned,eligible,changed});continue;}
    for(let pageNumber=0;pageNumber<pages;pageNumber++) {
      let query=db.collection(collection).orderBy(FieldPath.documentId()).limit(100);
      if(state.after) query=query.startAfter(state.after);
      const page=await query.get();
      for(const doc of page.docs) {
        scanned++;
        if(!deadline(collection,doc.data())) continue;
        eligible++;
        if(apply) {
          const updated=await db.runTransaction(async tx=>{
            const current=(await tx.get(doc.ref)).data(),deleteAfter=current&&deadline(collection,current);
            if(!deleteAfter) return false;
            tx.update(doc.ref,{deleteAfter}); return true;
          });
          if(updated) changed++;
        }
      }
      state={after:page.docs.at(-1)?.id||'',done:page.size<100};
      if(apply) await checkpoint.set(state);
      if(state.done) break;
    }
    report.push({collection,...state,scanned,eligible,changed});
  }
  return report;
}
async function main() {
  const args=process.argv.slice(2),value=key=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
  const project=value('project'),pages=Number(value('pages')||10);
  if(!['pluto-9b6ca','pluto-staging-92eb7'].includes(project) || !Number.isInteger(pages) || pages<1 || pages>100)
    throw Error('Use --project=pluto-9b6ca or --project=pluto-staging-92eb7 and --pages=1..100.');
  if(process.env.FIRESTORE_EMULATOR_HOST) throw Error('Live migration must not target an emulator.');
  const {initializeApp,applicationDefault,deleteApp}=backend('firebase-admin/app');
  const app=initializeApp({projectId:project,credential:applicationDefault()});
  try { console.log(JSON.stringify({project,apply:args.includes('--apply'),results:await migrate(getFirestore(app),{apply:args.includes('--apply'),pages})},null,2)); }
  finally {await deleteApp(app);}
}
module.exports={deadline,migrate};
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
