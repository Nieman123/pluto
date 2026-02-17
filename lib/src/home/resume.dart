import 'package:flutter/material.dart';

import '../custom/custom_text.dart';
import '../html_open_link.dart';

class Resume extends StatelessWidget {
  const Resume({
    Key? key,
    required this.width,
  }) : super(key: key);

  static const String _resumeUrl = '';

  final double width;

  @override
  Widget build(BuildContext context) {
    return Padding(
        padding: _resumeUrl == ''
            ? EdgeInsets.zero
            : EdgeInsets.only(right: width * 0.019),
        child: Visibility(
          visible: _resumeUrl != '',
          child: TextButton(
              onPressed: () => htmlOpenLink(_resumeUrl),
              child: CustomText(
                  text: 'MY RESUME',
                  fontSize: 20,
                  color: Theme.of(context).primaryColor)),
        ));
  }
}
