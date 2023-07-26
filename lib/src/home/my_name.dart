import 'package:flutter/material.dart';

class MyName extends StatelessWidget {
  MyName({
    Key? key,
    required this.isMobile,
    required this.context,
  }) : super(key: key);

  final bool isMobile;
  final BuildContext context;

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;
    return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12.0),
        child: isMobile
            ? SizedBox(
                width: width / 2,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: List.generate(1, (int i) {
                      return SizedBox(
                        width: width - width * 0.4,
                        child: const FittedBox(
                          fit: BoxFit.cover,
                          child: Text(
                            "Pluto",
                            textScaleFactor: 4.5,
                            style: TextStyle(
                              fontFamily: 'FjallaOne',
                              // letterSpacing: 10.5,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      );
                    })),
              )
            : const Text('Pluto',
                textScaleFactor: 7,
                style: TextStyle(
                  fontFamily: 'FjallaOne',
                  letterSpacing: 20.5,
                  color: Colors.white,
                  fontWeight: FontWeight.w500,
                )));
  }
}
