import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

void dismissAuthKeyboard() {
  FocusManager.instance.primaryFocus?.unfocus();
  // Native SSO can restore the keyboard when its account picker closes.
  // Send hide explicitly as well; do not await before opening a web popup.
  unawaited(SystemChannels.textInput.invokeMethod<void>('TextInput.hide'));
}
