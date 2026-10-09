import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:pluto/src/google_auth.dart';

void main() {
  test('ambiguous Android cancellation is not attributed to the user', () {
    final error = googleSignInFailure(GoogleSignInExceptionCode.canceled,
        nativeAndroid: true);
    expect(error.code, 'google-sign-in-incomplete');
    expect(error.message, contains('use email sign-in'));
    expect(error.message, isNot(contains('cancelled')));
    expect(
        googleSignInFailure(GoogleSignInExceptionCode.canceled,
                nativeAndroid: false)
            .code,
        'popup-closed-by-user');
  });
}
