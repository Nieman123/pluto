// A signed-out shared phone must not keep usable attendee credentials. Door
// replay evidence and its encryption keys belong to a separate lifecycle.
List<String> attendeeKeysToRemoveOnSignOut(Iterable<String> keys) => keys
    .where((key) =>
        key.startsWith('pluto-ticket-cache-v1:') ||
        key.startsWith('pluto-order-') ||
        key.startsWith('pluto-holder-') ||
        key.startsWith('pluto-account-'))
    .toList();
