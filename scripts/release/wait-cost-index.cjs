// An accepted index deployment can still be building. Do not launch a worker
// revision that depends on it until Firestore can execute the due-work query.
const {createRequire}=require('node:module'),{resolve}=require('node:path');
const backend=createRequire(resolve(__dirname,'../../functions/package.json'));
const {initializeApp,applicationDefault,deleteApp}=backend('firebase-admin/app');
const {getFirestore,FieldPath}=backend('firebase-admin/firestore');
async function main(){
  const project=process.env.DEPLOY_PROJECT_ID;
  if(!['pluto-9b6ca','pluto-staging-92eb7'].includes(project)) throw Error('Unexpected release project.');
  const app=initializeApp({projectId:project,credential:applicationDefault()});
  try {
    const orders=getFirestore(app).collection('ticketingOrders');
    const pending=['provisioning','open','processing'];
    const pendingCards=orders.where('method','==','stripe').where('status','in',pending);
    const queries=[
      orders.where('status','==','paid').where('nextFinancialCheckAt','<=',0).orderBy('nextFinancialCheckAt'),
      orders.where('status','in',pending).where('nextCheckoutCloseAt','<=',0).orderBy('nextCheckoutCloseAt'),
      pendingCards.where('email','==','index-probe@example.invalid'),
      pendingCards.where('ownerUid','==','index-probe'),
      pendingCards.where('eventId','==','index-probe').orderBy(FieldPath.documentId()),
      orders.where('email','==','index-probe@example.invalid').where('status','==','paid').orderBy('createdAt','desc'),
    ];
    for(let attempt=0;attempt<40;attempt++) {
      try {
        await Promise.all(queries.map(query=>query.limit(1).get()));
        console.log('Ticketing query indexes are ready.');return;
      } catch(error) {
        if(error.code!==9 || attempt===39) throw error;
        console.log('Waiting for ticketing query indexes to finish building.');
        await new Promise(done=>setTimeout(done,15000));
      }
    }
  } finally {await deleteApp(app);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
