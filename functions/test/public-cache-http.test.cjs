const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {ticketingRouter}=require('../lib/ticketing/routes');
const {TicketingError}=require('../lib/ticketing/domain');
test('only approved public event responses are cached; draft media, APIs and render failures stay private',async()=>{
  const now=Date.now(), event={id:'event',slug:'event',title:'Event',subtitle:'Music',status:'published',registrationMode:'free',
    startAt:new Date(now+3600000).toISOString(),endAt:new Date(now+7200000).toISOString(),timezone:'America/New_York',
    city:'Asheville',region:'NC',venueName:'Public venue',gallery:[],lineup:[],offers:[],theme:{accent:'#ffffff'}};
  let unavailable=false;
  const service={db:{collection(name){return {doc(key){return {get:async()=>({data:()=>key==='missing'?undefined:name==='eventSlugs'?{eventId:'event'}:event})};},
    get:async()=>({docs:[{data:()=>event}]})};}},
    async media(_event,asset){if(asset==='draft') throw new TicketingError(404,'Not published');return Buffer.from('public image');}};
  const app=express();app.engine('njk',(_file,_view,done)=>unavailable?done(Error('render failure')):done(null,'Public event'));
  app.set('views',__dirname);app.set('view engine','njk');
  // Avoid filesystem template lookup; this test verifies real HTTP middleware/header ordering.
  app.render=(_view,_data,done)=>unavailable?done(Error('render failure')):done(null,'Public event');
  app.use(ticketingRouter(()=>({}),service));
  const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const path of ['/events','/past-events','/events/event','/events/event/calendar.ics','/sitemap.xml']) {
      const response=await fetch(base+path);assert.equal(response.status,200,path);assert.equal(response.headers.get('cache-control'),'public, max-age=0, s-maxage=60, must-revalidate',path);
    }
    const media=await fetch(base+'/events/event/media/approved');assert.equal(media.status,200);assert.equal(media.headers.get('cache-control'),'public, max-age=300, s-maxage=300, must-revalidate');
    for(const path of ['/events/missing','/events/event/media/draft','/tickets/api/staff/events']) {
      const response=await fetch(base+path);assert.ok(response.status>=400,path);assert.equal(response.headers.get('cache-control'),'private, no-store',path);
    }
    unavailable=true;
    for(const path of ['/events','/past-events']) {const response=await fetch(base+path);assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'private, no-store');}
  } finally {await new Promise(done=>server.close(done));}
});
