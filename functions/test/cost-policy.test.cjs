const test = require('node:test'), assert = require('node:assert/strict');
const { workerPolicy, nextFinancialCheckAt } = require('../lib/ticketing/cost-policy');
const { financialOrderNeedsWork } = require('../lib/ticketing/financial-projection');
const { expiringGrant } = require('../lib/ticketing/retention');
const minute = 60000, day = 86400000, now = Date.now();

test('quiet staging cannot slow production and fractional CPU is an explicit opt-in', () => {
  assert.equal(workerPolicy({PLUTO_ENVIRONMENT:'staging'}).recoverySchedule, 'every 5 minutes');
  assert.equal(workerPolicy({PLUTO_ENVIRONMENT:'staging',TICKETING_WORKER_MODE:'active'}).recoverySchedule, 'every 1 minutes');
  assert.equal(workerPolicy({PLUTO_ENVIRONMENT:'production',TICKETING_WORKER_MODE:'quiet'}).recoverySchedule, 'every 1 minutes');
  assert.equal(workerPolicy({}).serial.cpu, 1);
  assert.equal(workerPolicy({}).healthCpu, 'gcf_gen1');
  assert.equal(workerPolicy({TICKETING_HEALTH_CPU:'1'}).healthCpu, 1);
  assert.throws(() => workerPolicy({TICKETING_HEALTH_CPU:'0.01'}));
  assert.equal(workerPolicy({TICKETING_WORKER_CPU:'gcf_gen1'}).serial.cpu, 'gcf_gen1');
  assert.throws(() => workerPolicy({TICKETING_WORKER_CPU:'0.01'}));
});
test('uncertainty stays on fast recovery while settled payments age out of frequent checks', () => {
  const settled = {paidAt:now-2*day,stripeFeeStatus:'confirmed',stripeFee:123,units:[]};
  assert.equal(nextFinancialCheckAt(settled,now),now+day);
  assert.equal(nextFinancialCheckAt({...settled,paidAt:now},now),now+60*minute);
  assert.equal(nextFinancialCheckAt({...settled,paidAt:now-181*day},now),now+7*day);
  assert.equal(nextFinancialCheckAt({...settled,paidAt:now-181*day,units:[{validUntil:new Date(now+day).toISOString()}]},now),now+day);
  for(const change of [{financialBlocked:true},{financialReviewReason:'review'},{reviewReason:'refund'}, {stripeFeeStatus:'pending'}, {stripeFee:null}])
    assert.equal(nextFinancialCheckAt({...settled,...change},now),now+5*minute);
});
test('financial projection ignores bookkeeping but detects admission fences and financial corrections', () => {
  const before={eventId:'event',status:'paid',method:'stripe',total:1500,paidAt:now,stripeFeeStatus:'confirmed',stripeFee:100,units:[{}]};
  assert.equal(financialOrderNeedsWork(before,{...before,nextFinancialCheckAt:now+day,paymentVerifiedAt:now,financialCheckId:'new',lastWorkerErrorAt:now}),false);
  for(const change of [{financialBlocked:true},{stripeFee:110},{refundedAmount:200},{taxAmount:50},{eventId:'another'},{paidAt:now-1},{units:[]}])
    assert.equal(financialOrderNeedsWork(before,{...before,...change}),true);
  assert.equal(financialOrderNeedsWork(before,undefined),true);
});
test('TTL grace does not change the authorization deadline', () => {
  const grant=expiringGrant(now);
  assert.equal(grant.expiresAt,now); assert.equal(grant.deleteAfter.toMillis(),now+7*day);
});
