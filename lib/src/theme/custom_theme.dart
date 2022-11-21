import 'package:flutter/material.dart';

class CustomTheme extends ChangeNotifier {
  bool isDarkTheme = true;
  ThemeMode get currentTheme => isDarkTheme ? ThemeMode.dark : ThemeMode.light;

  void toggleTheme() {
    isDarkTheme = !isDarkTheme;
    notifyListeners();
  }

  static ThemeData get lightTheme {
    return ThemeData(
      scaffoldBackgroundColor: Colors.white,
      hoverColor: const Color(0xFF1a4b6e).withOpacity(0.225),
      cardColor: const Color(0xFF519259),
      primaryColor: const Color(0xFF064635),
      primaryColorDark: Colors.white54,
      primaryColorLight: Colors.black,
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      scaffoldBackgroundColor: const Color.fromARGB(255, 24, 24, 24),
      hoverColor: const Color(0xFF1a4b6e),
      cardColor: const Color(0xFF10576e),
      primaryColor: const Color.fromARGB(255, 192, 190, 190),
      primaryColorDark: const Color.fromARGB(255, 192, 190, 190),
      primaryColorLight: Colors.white,
    );
  }
}
