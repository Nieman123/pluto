import 'package:flutter/material.dart';

class MyBio extends StatelessWidget {
  const MyBio({
    Key? key,
    required this.fontSize,
  }) : super(key: key);

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
              'Pluto is a organization of local DJs and producers who bring people together with music.',
              style: TextStyle(
                  fontFamily: 'SourceCodePro',
                  letterSpacing: 2,
                  color: Theme.of(context).primaryColorLight,
                  fontSize: fontSize),
            ),
          ),
        ],
      ),
    );
  }
}
