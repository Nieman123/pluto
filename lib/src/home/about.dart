import 'package:flutter/material.dart';

class About extends StatelessWidget {
  const About({
    Key? key,
    required this.fontSize,
  }) : super(key: key);

  static const String _aboutText =
      'Pluto is a organization of local DJs and producers who bring people together with music.';

  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12.0, 5.0, 12.0, 30.0),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 30.0),
            child: Text(
              _aboutText,
              style: TextStyle(
                  fontFamily: 'SourceCodePro',
                  letterSpacing: 2.5,
                  color: Theme.of(context).primaryColorLight,
                  fontSize: fontSize),
            ),
          ),
        ],
      ),
    );
  }
}
