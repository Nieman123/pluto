import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'native_environment.dart';

class AppBuildInfo extends StatefulWidget {
  const AppBuildInfo({super.key});
  @override
  State<AppBuildInfo> createState() => _AppBuildInfoState();
}

class _AppBuildInfoState extends State<AppBuildInfo> {
  late final Future<PackageInfo> _info = PackageInfo.fromPlatform();

  @override
  Widget build(BuildContext context) => FutureBuilder<PackageInfo>(
        future: _info,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done)
            return const SizedBox.shrink();
          final info = snapshot.data;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: SelectableText(
                info == null
                    ? 'App version unavailable'
                    : 'Pluto Events${plutoEnvironment == 'staging' ? ' · Staging' : ''}\nVersion ${info.version} · Build ${info.buildNumber}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 13)),
          );
        },
      );
}
