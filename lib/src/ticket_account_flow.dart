/// Auth may return to the ticket wallet, without forwarding credential fragments.
String? ticketAccountReturn(String? value) {
  final Uri? uri = value == null ? null : Uri.tryParse(value);
  if (uri == null ||
      uri.hasScheme ||
      uri.hasAuthority ||
      uri.path != '/tickets') {
    return null;
  }
  final String? order = uri.queryParameters['order'];
  return Uri(
          path: '/tickets',
          queryParameters:
              order == null ? null : <String, String>{'order': order})
      .toString();
}
