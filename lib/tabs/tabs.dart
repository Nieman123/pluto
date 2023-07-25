import 'package:flutter/material.dart';

import 'artists.dart';
import 'contact_me.dart';
import 'event.dart';
import 'home.dart';

export 'achievements.dart';
export 'contact_me.dart';
export 'education.dart';
export 'experience.dart';
export 'home.dart';
export 'projects.dart';
export 'scroll_controller.dart';

List<Widget> widgetList = [
  const HomePage(),
  const Event(),
  const Artist(),
  const ContactMe(),
];
