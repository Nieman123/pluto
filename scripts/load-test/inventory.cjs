// Keep cloud recovery from acting on synthetic reservations. Only benchmark
// fixtures may use this adapter; normal checkout code runs unchanged.
function inventoryFacade(db, runId) {
  return new Proxy(db, { get(target, property) {
    if (property === 'runTransaction') return fn => target.runTransaction(tx => fn(new Proxy(tx, { get(transaction, method) {
      if (method === 'create') return (ref, data) => {
        if (ref.parent.id === 'ticketingOrders') {
          if (!data.eventId?.startsWith(`load_${runId}_`)) throw new Error('Inventory fixture scope mismatch');
          data = { ...data, status: 'load-test-reserved', loadTestRun: runId };
        }
        return transaction.create(ref, data);
      };
      const item = transaction[method]; return typeof item === 'function' ? item.bind(transaction) : item;
    } })));
    const item = target[property]; return typeof item === 'function' ? item.bind(target) : item;
  } });
}
const noStripe = () => new Proxy({}, { get() { throw new Error('Stripe calls are forbidden in inventory diagnostics'); } });
module.exports = { inventoryFacade, noStripe };
