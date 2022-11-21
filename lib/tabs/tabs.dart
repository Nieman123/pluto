import 'package:flutter/material.dart';

import 'achievements.dart';
import 'contact_me.dart';
import 'education.dart';
import 'experience.dart';
import 'home.dart';
import 'event.dart';
import 'join.dart';
import 'projects.dart';

export 'achievements.dart';
export 'contact_me.dart';
export 'education.dart';
export 'experience.dart';
export 'home.dart';
export 'join.dart';
export 'projects.dart';
export 'scroll_controller.dart';

List<Widget> widgetList = [
  const HomePage(),
  Join(),
  const Event(),
  const ContactMe(),
];
