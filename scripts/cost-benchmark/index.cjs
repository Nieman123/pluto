// Temporary authenticated staging functions. Real health-audit implementation,
// isolated synthetic Firestore data, no payment/email credentials or app queues.
const {onRequest}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {collectHealth}=require('./lib/health');
initializeApp();
let cold=true;
function endpoint(cpu,label) {
  return onRequest({region:'us-central1',cpu,memory:'256MiB',concurrency:1,minInstances:0,maxInstances:1,
    timeoutSeconds:120,invoker:'private'},async(req,res)=>{
    if(process.env.GCLOUD_PROJECT!=='pluto-staging-92eb7') return res.status(403).end();
    const {runId,action}=req.body||{};
    if(!/^[a-f0-9]{32}$/.test(runId)||!['setup','audit','cleanup'].includes(action)) return res.status(400).end();
    const db=getFirestore(),root=db.collection('costCpuBenchmarks').doc(`${runId}_${label}`);
    if(action==='setup') {
      const batch=db.batch();batch.set(root,{benchmark:true,runId,label});
      for(const lane of ['maintenance','maintenance-emails','maintenance-communications'])
        batch.set(root.collection('ticketingHealth').doc(lane),{completedAt:Date.now(),splitWorkers:true});
      for(let i=0;i<50;i++) {
        batch.set(root.collection('ticketingOrders').doc(`order_${i}`),{status:'paid',units:[{}],paidAt:Date.now(),createdAt:Date.now()});
        batch.set(root.collection('ticketingTickets').doc(`ticket_${i}`),{orderId:`order_${i}`});
      }
      await batch.commit();return res.json({prepared:true});
    }
    if((await root.get()).data()?.runId!==runId) return res.status(409).end();
    if(action==='cleanup') {await db.recursiveDelete(root);return res.json({removed:true});}
    const facade={collection:name=>root.collection(name),getAll:db.getAll.bind(db)};
    const started=performance.now(),wasCold=cold;cold=false;
    const result=await collectHealth(facade);
    res.json({label,elapsedMs:performance.now()-started,cold:wasCold,rssBytes:process.memoryUsage().rss,
      checkedPaidOrders:result.checkedPaidOrders,critical:result.counts.critical});
  });
}
exports.costHealthBenchmarkFull=endpoint(1,'full');
exports.costHealthBenchmarkFractional=endpoint('gcf_gen1','fractional');
