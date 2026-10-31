// An accepted index deployment can still be building. Do not launch a worker
// revision that depends on it until Firestore can execute the due-work query.
const {createRequire}=require('node:module'),{resolve}=require('node:path');
const backend=createRequire(resolve(__dirname,'../../functions/package.json'));
const {initializeApp,applicationDefault,deleteApp}=backend('firebase-admin/app');
const {getFirestore}=backend('firebase-admin/firestore');
async function main(){
  const project=process.env.DEPLOY_PROJECT_ID;
  if(!['pluto-9b6ca','pluto-staging-92eb7'].includes(project)) throw Error('Unexpected release project.');
  const app=initializeApp({projectId:project,credential:applicationDefault()});
  try {
    for(let attempt=0;attempt<40;attempt++) {
      try {
        await getFirestore(app).collection('ticketingOrders').where('status','==','paid')
          .where('nextFinancialCheckAt','<=',0).orderBy('nextFinancialCheckAt').limit(1).get();
        console.log('Due-payment index is ready.');return;
      } catch(error) {
        if(error.code!==9 || attempt===39) throw error;
        console.log('Waiting for due-payment index to finish building.');
        await new Promise(done=>setTimeout(done,15000));
      }
    }
  } finally {await deleteApp(app);}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
