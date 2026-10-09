import 'package:flutter/material.dart';
import 'pluto_ui.dart';

class CustomTheme extends ChangeNotifier {
  bool isDarkTheme = true;
  ThemeMode get currentTheme => isDarkTheme ? ThemeMode.dark : ThemeMode.light;

  static const Color _appBarColor = Color(0xFF121212);

  void toggleTheme() {
    isDarkTheme = !isDarkTheme;
    notifyListeners();
  }

  static ThemeData get lightTheme {
    return ThemeData(
      scaffoldBackgroundColor: Colors.white,
      hoverColor: const Color(0xFF1a4b6e).withValues(alpha: 0.225),
      cardColor: const Color(0xFF519259),
      primaryColor: const Color(0xFF064635),
      primaryColorDark: Colors.white54,
      primaryColorLight: Colors.black,
      appBarTheme: const AppBarTheme(
        backgroundColor: _appBarColor,
        foregroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
      ),
    );
  }

  static ThemeData get darkTheme {
    final scheme = ColorScheme.fromSeed(
      seedColor: PlutoColors.lilac,
      brightness: Brightness.dark,
      primary: PlutoColors.lilac,
      secondary: PlutoColors.orange,
      surface: PlutoColors.surface,
      onSurface: PlutoColors.ink,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: 'Montserrat',
      scaffoldBackgroundColor: PlutoColors.background,
      primaryColor: PlutoColors.ink,
      primaryColorDark: PlutoColors.muted,
      primaryColorLight: PlutoColors.ink,
      cardColor: PlutoColors.surface,
      textTheme: ThemeData.dark().textTheme.apply(
            fontFamily: 'Montserrat',
            bodyColor: PlutoColors.ink,
            displayColor: PlutoColors.ink,
          ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: PlutoColors.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: const BorderSide(color: Color(0x33D4B2FF))),
        clipBehavior: Clip.antiAlias,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
        backgroundColor: PlutoColors.lilac,
        foregroundColor: const Color(0xFF251432),
        elevation: 0,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      )),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      )),
      outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
        foregroundColor: PlutoColors.ink,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        side: const BorderSide(color: Color(0x55D4B2FF)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      )),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF17121E),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0x44D4B2FF))),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: PlutoColors.lilac, width: 2)),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: PlutoColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(26)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF3A2850),
        contentTextStyle:
            const TextStyle(color: PlutoColors.ink, fontFamily: 'Montserrat'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: PlutoColors.lilac),
      appBarTheme: const AppBarTheme(
        backgroundColor: PlutoColors.background,
        foregroundColor: PlutoColors.ink,
        surfaceTintColor: Colors.transparent,
      ),
    );
  }
}
