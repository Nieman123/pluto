import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:file_picker/file_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:sa3_liquid/liquid/plasma/plasma.dart';

import 'current_events_repository.dart';
import 'user_profile_repository.dart';

class AdminPage extends StatefulWidget {
  const AdminPage({Key? key}) : super(key: key);

  @override
  State<AdminPage> createState() => _AdminPageState();
}

class _AdminPageState extends State<AdminPage> {
  final CurrentEventsRepository _eventsRepository = CurrentEventsRepository();
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _detailsController = TextEditingController();
  final TextEditingController _ticketUrlController = TextEditingController();
  final TextEditingController _sortOrderController =
      TextEditingController(text: '0');
  final TextEditingController _rewardNameController = TextEditingController();
  final TextEditingController _rewardDescriptionController =
      TextEditingController();
  final TextEditingController _rewardPointsCostController =
      TextEditingController(text: '100');
  final TextEditingController _rewardInventoryController =
      TextEditingController();
  final TextEditingController _rewardCategoryController =
      TextEditingController();
  final TextEditingController _eventQrNameController = TextEditingController();
  final TextEditingController _eventQrCodeController = TextEditingController();
  final TextEditingController _eventQrPointsController =
      TextEditingController(text: '50');
  final TextEditingController _eventQrNotesController = TextEditingController();

  String? _editingEventId;
  String _flyerDataUrl = '';
  bool _isActive = true;
  bool _isSaving = false;
  String? _editingRewardId;
  String _rewardImageDataUrl = '';
  bool _rewardIsActive = true;
  bool _isSavingReward = false;
  String? _editingEventQrId;
  bool _eventQrIsActive = true;
  bool _isSavingEventQr = false;
  String _statusMessage = '';

  @override
  void initState() {
    super.initState();
    _eventQrCodeController.text = _generateEventQrCodeValue();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _detailsController.dispose();
    _ticketUrlController.dispose();
    _sortOrderController.dispose();
    _rewardNameController.dispose();
    _rewardDescriptionController.dispose();
    _rewardPointsCostController.dispose();
    _rewardInventoryController.dispose();
    _rewardCategoryController.dispose();
    _eventQrNameController.dispose();
    _eventQrCodeController.dispose();
    _eventQrPointsController.dispose();
    _eventQrNotesController.dispose();
    super.dispose();
  }

  Future<void> _pickFlyerImage() async {
    final FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: <String>['png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) {
      return;
    }

    final PlatformFile file = result.files.first;
    final Uint8List? fileBytes = file.bytes;
    if (fileBytes == null) {
      setState(() {
        _statusMessage = 'Unable to read image bytes.';
      });
      return;
    }

    if (fileBytes.lengthInBytes > 900000) {
      setState(() {
        _statusMessage =
            'Image is too large for Firestore document storage. Use a smaller file.';
      });
      return;
    }

    final String mimeType = _mimeTypeForExtension(file.extension ?? '');
    final String dataUrl = 'data:$mimeType;base64,${base64Encode(fileBytes)}';

    setState(() {
      _flyerDataUrl = dataUrl;
      _statusMessage = 'Flyer selected.';
    });
  }

  Future<void> _saveEvent() async {
    final String title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() {
        _statusMessage = 'Title is required.';
      });
      return;
    }

    final int? parsedSortOrder = int.tryParse(_sortOrderController.text.trim());
    if (parsedSortOrder == null) {
      setState(() {
        _statusMessage = 'Sort order must be a number.';
      });
      return;
    }

    setState(() {
      _isSaving = true;
      _statusMessage = '';
    });

    try {
      final String eventId = await _eventsRepository.saveEvent(
        id: _editingEventId,
        title: title,
        details: _detailsController.text,
        ticketUrl: _ticketUrlController.text,
        flyerDataUrl: _flyerDataUrl,
        isActive: _isActive,
        sortOrder: parsedSortOrder,
      );

      if (!mounted) {
        return;
      }
      setState(() {
        _editingEventId = eventId;
        _statusMessage = 'Event saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save event: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  Future<void> _deleteEvent(CurrentEvent event) async {
    final bool? shouldDelete = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Delete Event?'),
          content: Text('Delete "${event.title}" from current events?'),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );

    if (shouldDelete != true) {
      return;
    }

    try {
      await _eventsRepository.deleteEvent(event.id);
      if (!mounted) {
        return;
      }
      if (_editingEventId == event.id) {
        _startNewEvent();
      }
      setState(() {
        _statusMessage = 'Event deleted.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to delete event: $error';
      });
    }
  }

  void _editEvent(CurrentEvent event) {
    setState(() {
      _editingEventId = event.id;
      _titleController.text = event.title;
      _detailsController.text = event.details;
      _ticketUrlController.text = event.ticketUrl;
      _sortOrderController.text = event.sortOrder.toString();
      _isActive = event.isActive;
      _flyerDataUrl = event.flyerDataUrl;
      _statusMessage = 'Editing "${event.title}".';
    });
  }

  void _startNewEvent() {
    setState(() {
      _editingEventId = null;
      _titleController.clear();
      _detailsController.clear();
      _ticketUrlController.clear();
      _sortOrderController.text = '0';
      _flyerDataUrl = '';
      _isActive = true;
      _statusMessage = 'New event form ready.';
    });
  }

  InputDecoration _inputDecoration(String labelText) {
    return InputDecoration(
      labelText: labelText,
      labelStyle: const TextStyle(color: Colors.white70),
      border: const OutlineInputBorder(),
      enabledBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Colors.white54),
      ),
      focusedBorder: const OutlineInputBorder(
        borderSide: BorderSide(color: Colors.white),
      ),
    );
  }

  Stream<List<RewardItem>> _watchRewardItems() {
    return _firestore.collection('rewardItems').snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<RewardItem> rewards =
            snapshot.docs.map(RewardItem.fromSnapshot).toList();
        rewards.sort((RewardItem a, RewardItem b) {
          if (a.isActive != b.isActive) {
            return a.isActive ? -1 : 1;
          }

          final int byCost = a.pointsCost.compareTo(b.pointsCost);
          if (byCost != 0) {
            return byCost;
          }

          return a.name.toLowerCase().compareTo(b.name.toLowerCase());
        });
        return rewards;
      },
    );
  }

  Future<void> _pickRewardImage() async {
    final FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: <String>['png', 'jpg', 'jpeg', 'webp'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) {
      return;
    }

    final PlatformFile file = result.files.first;
    final Uint8List? fileBytes = file.bytes;
    if (fileBytes == null) {
      setState(() {
        _statusMessage = 'Unable to read reward image bytes.';
      });
      return;
    }

    if (fileBytes.lengthInBytes > 900000) {
      setState(() {
        _statusMessage =
            'Reward image too large for Firestore document storage.';
      });
      return;
    }

    final String mimeType = _mimeTypeForExtension(file.extension ?? '');
    setState(() {
      _rewardImageDataUrl = encodeDataUrl(bytes: fileBytes, mimeType: mimeType);
      _statusMessage = 'Reward image selected.';
    });
  }

  Future<void> _saveRewardItem() async {
    final String rewardName = _rewardNameController.text.trim();
    if (rewardName.isEmpty) {
      setState(() {
        _statusMessage = 'Reward name is required.';
      });
      return;
    }

    final int? pointsCost =
        int.tryParse(_rewardPointsCostController.text.trim());
    if (pointsCost == null || pointsCost <= 0) {
      setState(() {
        _statusMessage =
            'Reward Pluto Points cost must be a number greater than 0.';
      });
      return;
    }

    final String inventoryText = _rewardInventoryController.text.trim();
    int? inventory;
    if (inventoryText.isNotEmpty) {
      inventory = int.tryParse(inventoryText);
      if (inventory == null || inventory < 0) {
        setState(() {
          _statusMessage =
              'Inventory must be a non-negative number or left blank.';
        });
        return;
      }
    }

    setState(() {
      _isSavingReward = true;
      _statusMessage = '';
    });

    try {
      final DocumentReference<Map<String, dynamic>> rewardDoc =
          (_editingRewardId == null || _editingRewardId!.isEmpty)
              ? _firestore.collection('rewardItems').doc()
              : _firestore.collection('rewardItems').doc(_editingRewardId);
      final DocumentSnapshot<Map<String, dynamic>> existingSnapshot =
          await rewardDoc.get();

      final Map<String, dynamic> payload = <String, dynamic>{
        'name': rewardName,
        'description': _rewardDescriptionController.text.trim(),
        'pointsCost': pointsCost,
        'isActive': _rewardIsActive,
        'category': _rewardCategoryController.text.trim(),
        'imageDataUrl': _rewardImageDataUrl,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (inventory == null) {
        payload['inventory'] = FieldValue.delete();
      } else {
        payload['inventory'] = inventory;
      }

      if (!existingSnapshot.exists) {
        payload['createdAt'] = FieldValue.serverTimestamp();
      }

      await rewardDoc.set(payload, SetOptions(merge: true));

      if (!mounted) {
        return;
      }
      setState(() {
        _editingRewardId = rewardDoc.id;
        _statusMessage = 'Reward item saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save reward item: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingReward = false;
        });
      }
    }
  }

  Future<void> _deleteRewardItem(RewardItem rewardItem) async {
    final bool? shouldDelete = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Delete Reward Item?'),
          content: Text('Delete "${rewardItem.name}" from rewardItems?'),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );

    if (shouldDelete != true) {
      return;
    }

    try {
      await _firestore.collection('rewardItems').doc(rewardItem.id).delete();
      if (!mounted) {
        return;
      }

      if (_editingRewardId == rewardItem.id) {
        _startNewRewardItem();
      }
      setState(() {
        _statusMessage = 'Reward item deleted.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to delete reward item: $error';
      });
    }
  }

  void _editRewardItem(RewardItem rewardItem) {
    setState(() {
      _editingRewardId = rewardItem.id;
      _rewardNameController.text = rewardItem.name;
      _rewardDescriptionController.text = rewardItem.description;
      _rewardPointsCostController.text = rewardItem.pointsCost.toString();
      _rewardInventoryController.text = rewardItem.inventory?.toString() ?? '';
      _rewardCategoryController.text = rewardItem.category;
      _rewardIsActive = rewardItem.isActive;
      _rewardImageDataUrl = rewardItem.imageDataUrl;
      _statusMessage = 'Editing reward "${rewardItem.name}".';
    });
  }

  void _startNewRewardItem() {
    setState(() {
      _editingRewardId = null;
      _rewardNameController.clear();
      _rewardDescriptionController.clear();
      _rewardPointsCostController.text = '100';
      _rewardInventoryController.clear();
      _rewardCategoryController.clear();
      _rewardIsActive = true;
      _rewardImageDataUrl = '';
      _statusMessage = 'New reward item form ready.';
    });
  }

  String _generateEventQrCodeValue() {
    final String rawId = _firestore.collection('eventQrCodes').doc().id;
    return 'PLUTO-${rawId.toUpperCase()}';
  }

  Stream<List<EventQrCode>> _watchEventQrCodes() {
    return _firestore.collection('eventQrCodes').snapshots().map(
      (QuerySnapshot<Map<String, dynamic>> snapshot) {
        final List<EventQrCode> qrCodes =
            snapshot.docs.map(EventQrCode.fromSnapshot).toList();
        qrCodes.sort((EventQrCode a, EventQrCode b) {
          if (a.isActive != b.isActive) {
            return a.isActive ? -1 : 1;
          }

          final DateTime aDate = a.updatedAt ??
              a.createdAt ??
              DateTime.fromMillisecondsSinceEpoch(0);
          final DateTime bDate = b.updatedAt ??
              b.createdAt ??
              DateTime.fromMillisecondsSinceEpoch(0);
          return bDate.compareTo(aDate);
        });
        return qrCodes;
      },
    );
  }

  Future<void> _saveEventQrCode() async {
    final String eventName = _eventQrNameController.text.trim();
    if (eventName.isEmpty) {
      setState(() {
        _statusMessage = 'Event name is required for the QR code.';
      });
      return;
    }

    final int? pointsAwarded =
        int.tryParse(_eventQrPointsController.text.trim());
    if (pointsAwarded == null || pointsAwarded <= 0) {
      setState(() {
        _statusMessage =
            'Pluto Points awarded must be a number greater than 0.';
      });
      return;
    }

    final String normalizedCode =
        _eventQrCodeController.text.trim().toUpperCase();
    if (normalizedCode.isEmpty) {
      setState(() {
        _statusMessage = 'QR code value is required.';
      });
      return;
    }

    setState(() {
      _isSavingEventQr = true;
      _statusMessage = '';
    });

    try {
      final QuerySnapshot<Map<String, dynamic>> existingCodeQuery =
          await _firestore
              .collection('eventQrCodes')
              .where('code', isEqualTo: normalizedCode)
              .limit(2)
              .get();
      final bool codeUsedByAnotherDoc = existingCodeQuery.docs.any(
        (QueryDocumentSnapshot<Map<String, dynamic>> doc) =>
            doc.id != _editingEventQrId,
      );
      if (codeUsedByAnotherDoc) {
        if (!mounted) {
          return;
        }
        setState(() {
          _statusMessage =
              'That QR code value is already used by another event QR record.';
          _isSavingEventQr = false;
        });
        return;
      }

      final DocumentReference<Map<String, dynamic>> eventQrDoc =
          (_editingEventQrId == null || _editingEventQrId!.isEmpty)
              ? _firestore.collection('eventQrCodes').doc()
              : _firestore.collection('eventQrCodes').doc(_editingEventQrId);
      final DocumentSnapshot<Map<String, dynamic>> existingSnapshot =
          await eventQrDoc.get();

      final Map<String, dynamic> payload = <String, dynamic>{
        'eventName': eventName,
        'code': normalizedCode,
        'pointsAwarded': pointsAwarded,
        'notes': _eventQrNotesController.text.trim(),
        'isActive': _eventQrIsActive,
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (!existingSnapshot.exists) {
        payload['createdAt'] = FieldValue.serverTimestamp();
        payload['totalClaims'] = 0;
      }

      await eventQrDoc.set(payload, SetOptions(merge: true));
      if (!mounted) {
        return;
      }
      setState(() {
        _editingEventQrId = eventQrDoc.id;
        _eventQrCodeController.text = normalizedCode;
        _statusMessage = 'Event QR code saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save event QR code: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingEventQr = false;
        });
      }
    }
  }

  Future<void> _deleteEventQrCode(EventQrCode eventQrCode) async {
    final bool? shouldDelete = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('Delete Event QR?'),
          content: Text(
            'Delete QR for "${eventQrCode.eventName}"? '
            'This keeps past user Pluto Points history but removes this code.',
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );

    if (shouldDelete != true) {
      return;
    }

    try {
      await _firestore.collection('eventQrCodes').doc(eventQrCode.id).delete();
      if (!mounted) {
        return;
      }
      if (_editingEventQrId == eventQrCode.id) {
        _startNewEventQrCode();
      }
      setState(() {
        _statusMessage = 'Event QR code deleted.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to delete event QR code: $error';
      });
    }
  }

  Future<void> _copyEventQrCodeToClipboard(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (!mounted) {
      return;
    }
    setState(() {
      _statusMessage = 'Copied QR code value to clipboard.';
    });
  }

  Future<void> _downloadEventQrCode(EventQrCode eventQrCode) async {
    final String normalizedCode = eventQrCode.code.trim();
    if (normalizedCode.isEmpty) {
      setState(() {
        _statusMessage = 'QR code value is empty. Nothing to download.';
      });
      return;
    }

    try {
      final QrPainter painter = QrPainter(
        data: normalizedCode,
        version: QrVersions.auto,
        gapless: true,
        eyeStyle: const QrEyeStyle(color: Colors.black),
        dataModuleStyle: const QrDataModuleStyle(color: Colors.black),
      );
      final ByteData? qrImageData = await painter.toImageData(1200);
      if (qrImageData == null) {
        if (!mounted) {
          return;
        }
        setState(() {
          _statusMessage = 'Failed to generate QR image bytes.';
        });
        return;
      }

      final Uint8List pngBytes = qrImageData.buffer.asUint8List();
      final String fileName =
          '${_sanitizeFileSegment(eventQrCode.eventName)}_qr.png';
      final String? savedPath = await FilePicker.platform.saveFile(
        dialogTitle: 'Download QR Code',
        fileName: fileName,
        type: FileType.custom,
        allowedExtensions: <String>['png'],
        bytes: pngBytes,
      );

      if (!mounted) {
        return;
      }
      setState(() {
        if (kIsWeb) {
          _statusMessage = 'QR code download started.';
        } else if (savedPath == null || savedPath.isEmpty) {
          _statusMessage = 'QR code download canceled.';
        } else {
          _statusMessage = 'QR code saved to $savedPath';
        }
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to download QR code: $error';
      });
    }
  }

  void _editEventQrCode(EventQrCode eventQrCode) {
    setState(() {
      _editingEventQrId = eventQrCode.id;
      _eventQrNameController.text = eventQrCode.eventName;
      _eventQrCodeController.text = eventQrCode.code;
      _eventQrPointsController.text = eventQrCode.pointsAwarded.toString();
      _eventQrNotesController.text = eventQrCode.notes;
      _eventQrIsActive = eventQrCode.isActive;
      _statusMessage = 'Editing QR for "${eventQrCode.eventName}".';
    });
  }

  void _startNewEventQrCode() {
    setState(() {
      _editingEventQrId = null;
      _eventQrNameController.clear();
      _eventQrCodeController.text = _generateEventQrCodeValue();
      _eventQrPointsController.text = '50';
      _eventQrNotesController.clear();
      _eventQrIsActive = true;
      _statusMessage = 'New event QR code form ready.';
    });
  }

  Widget _buildSignedOutState() {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 600),
        child: Card(
          color: Colors.black.withValues(alpha: 0.45),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Sign in required',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'You must sign in before opening the admin editor.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () => context.go('/sign-on'),
                  child: const Text('Open Sign On'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildUnauthorizedState(User user) {
    final String projectId = Firebase.app().options.projectId;
    final String expectedDocPath = 'adminUsers/${user.uid}';

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: Card(
          color: Colors.black.withValues(alpha: 0.45),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Admin access denied',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'This user is signed in, but the UID is not present in Firestore at adminUsers/{uid}.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 10),
                SelectableText(
                  'Project: $projectId',
                  style: const TextStyle(color: Colors.white),
                ),
                SelectableText(
                  'UID: ${user.uid}',
                  style: const TextStyle(color: Colors.white),
                ),
                SelectableText(
                  'Expected document: $expectedDocPath',
                  style: const TextStyle(color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAdminReadErrorState(User user, Object? error) {
    final String projectId = Firebase.app().options.projectId;
    final String expectedDocPath = 'adminUsers/${user.uid}';
    final String errorMessage;
    if (error is FirebaseException) {
      errorMessage =
          '${error.code}: ${error.message ?? 'Unknown Firestore error'}';
    } else {
      errorMessage = error?.toString() ?? 'Unknown error';
    }

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: Card(
          color: Colors.black.withValues(alpha: 0.45),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Admin check failed',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Firestore could not read the admin user document. This is usually a Firestore security rules issue.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 10),
                SelectableText(
                  'Error: $errorMessage',
                  style: const TextStyle(color: Colors.white),
                ),
                SelectableText(
                  'Project: $projectId',
                  style: const TextStyle(color: Colors.white),
                ),
                SelectableText(
                  'UID: ${user.uid}',
                  style: const TextStyle(color: Colors.white),
                ),
                SelectableText(
                  'Expected document: $expectedDocPath',
                  style: const TextStyle(color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEditorLayout() {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final Widget editor = _buildEditorCard();
        final Widget events = _buildEventsCard();
        final Widget rewardEditor = _buildRewardEditorCard();
        final Widget rewardItems = _buildRewardItemsCard();
        final Widget eventQrEditor = _buildEventQrEditorCard();
        final Widget eventQrCodes = _buildEventQrCodesCard();
        final Widget managementPane = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            events,
            const SizedBox(height: 16),
            eventQrEditor,
            const SizedBox(height: 16),
            eventQrCodes,
            const SizedBox(height: 16),
            rewardEditor,
            const SizedBox(height: 16),
            rewardItems,
          ],
        );

        if (constraints.maxWidth < 1100) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: <Widget>[
              editor,
              const SizedBox(height: 16),
              events,
              const SizedBox(height: 16),
              eventQrEditor,
              const SizedBox(height: 16),
              eventQrCodes,
              const SizedBox(height: 16),
              rewardEditor,
              const SizedBox(height: 16),
              rewardItems,
            ],
          );
        }

        final bool hasBoundedHeight = constraints.maxHeight.isFinite;
        final double paneHeight = hasBoundedHeight
            ? (constraints.maxHeight - 32 >= 200
                ? constraints.maxHeight - 32
                : 200)
            : 800;

        return Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                flex: 5,
                child: SizedBox(
                  height: paneHeight,
                  child: SingleChildScrollView(child: editor),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                flex: 6,
                child: SizedBox(
                  height: paneHeight,
                  child: SingleChildScrollView(child: managementPane),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildEditorCard() {
    final Uint8List? flyerBytes = decodeFlyerDataUrl(_flyerDataUrl);

    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              _editingEventId == null
                  ? 'Create Current Event'
                  : 'Edit Current Event',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _titleController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Title'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _detailsController,
              maxLines: 3,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration:
                  _inputDecoration('Details (date, time, location, etc.)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _ticketUrlController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Ticket URL (optional)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _sortOrderController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Sort Order'),
            ),
            SwitchListTile(
              title: const Text('Active event'),
              value: _isActive,
              onChanged: (bool value) {
                setState(() {
                  _isActive = value;
                });
              },
            ),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                ElevatedButton(
                  onPressed: _isSaving ? null : _pickFlyerImage,
                  child: const Text('Upload Flyer Image'),
                ),
                OutlinedButton(
                  onPressed: _isSaving
                      ? null
                      : () {
                          setState(() {
                            _flyerDataUrl = '';
                            _statusMessage = 'Flyer image removed.';
                          });
                        },
                  child: const Text('Remove Flyer'),
                ),
              ],
            ),
            if (flyerBytes != null) ...<Widget>[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(
                  flyerBytes,
                  height: 260,
                  fit: BoxFit.cover,
                ),
              ),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                ElevatedButton(
                  onPressed: _isSaving ? null : _saveEvent,
                  child: const Text('Save Event'),
                ),
                OutlinedButton(
                  onPressed: _isSaving ? null : _startNewEvent,
                  child: const Text('New Event'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRewardEditorCard() {
    final Uint8List? rewardImageBytes = decodeDataUrl(_rewardImageDataUrl);

    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              _editingRewardId == null
                  ? 'Create Reward Item'
                  : 'Edit Reward Item',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _rewardNameController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Reward Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _rewardDescriptionController,
              maxLines: 3,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Description'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _rewardPointsCostController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Pluto Points Cost'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _rewardInventoryController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration(
                  'Inventory (optional, leave blank for unlimited)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _rewardCategoryController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Category (optional)'),
            ),
            SwitchListTile(
              title: const Text('Active reward item'),
              value: _rewardIsActive,
              onChanged: (bool value) {
                setState(() {
                  _rewardIsActive = value;
                });
              },
            ),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                ElevatedButton(
                  onPressed: _isSavingReward ? null : _pickRewardImage,
                  child: const Text('Upload Reward Image'),
                ),
                OutlinedButton(
                  onPressed: _isSavingReward
                      ? null
                      : () {
                          setState(() {
                            _rewardImageDataUrl = '';
                            _statusMessage = 'Reward image removed.';
                          });
                        },
                  child: const Text('Remove Image'),
                ),
              ],
            ),
            if (rewardImageBytes != null) ...<Widget>[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(
                  rewardImageBytes,
                  height: 220,
                  fit: BoxFit.cover,
                ),
              ),
            ],
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                ElevatedButton(
                  onPressed: _isSavingReward ? null : _saveRewardItem,
                  child: Text(_isSavingReward ? 'Saving...' : 'Save Reward'),
                ),
                OutlinedButton(
                  onPressed: _isSavingReward ? null : _startNewRewardItem,
                  child: const Text('New Reward'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRewardItemsCard() {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<List<RewardItem>>(
          stream: _watchRewardItems(),
          builder:
              (BuildContext context, AsyncSnapshot<List<RewardItem>> snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const SizedBox(
                height: 120,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            if (snapshot.hasError) {
              return Text(
                'Failed to load reward items: ${snapshot.error}',
                style: const TextStyle(color: Colors.white70),
              );
            }

            final List<RewardItem> rewards = snapshot.data ?? <RewardItem>[];
            if (rewards.isEmpty) {
              return const Text(
                'No reward items found. Create one using the reward form.',
                style: TextStyle(color: Colors.white70),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Reward Items',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                ...rewards.map((RewardItem reward) {
                  return Card(
                    color: Colors.black.withValues(alpha: 0.35),
                    margin: const EdgeInsets.only(bottom: 10),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            reward.name.isEmpty
                                ? '(Unnamed reward)'
                                : reward.name,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Active: ${reward.isActive} | Cost: ${reward.pointsCost} Pluto Points | Inventory: ${reward.inventory?.toString() ?? 'unlimited'}',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          if (reward.category.isNotEmpty)
                            Text(
                              'Category: ${reward.category}',
                              style: const TextStyle(color: Colors.white70),
                            ),
                          if (reward.description.isNotEmpty) ...<Widget>[
                            const SizedBox(height: 6),
                            Text(
                              reward.description,
                              style: const TextStyle(color: Colors.white70),
                            ),
                          ],
                          if (reward.imageBytes != null) ...<Widget>[
                            const SizedBox(height: 10),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.memory(
                                reward.imageBytes!,
                                height: 150,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ],
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: <Widget>[
                              ElevatedButton(
                                onPressed: () => _editRewardItem(reward),
                                child: const Text('Edit'),
                              ),
                              OutlinedButton(
                                onPressed: () => _deleteRewardItem(reward),
                                child: const Text('Delete'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildEventQrEditorCard() {
    final String previewCode = _eventQrCodeController.text.trim().toUpperCase();

    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              _editingEventQrId == null
                  ? 'Create Event QR Code'
                  : 'Edit Event QR Code',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Users scan this QR at the venue to receive Pluto Points.',
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _eventQrNameController,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Event Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _eventQrPointsController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Pluto Points Awarded'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _eventQrCodeController,
              onChanged: (_) {
                setState(() {});
              },
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('QR Code Value'),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                OutlinedButton(
                  onPressed: _isSavingEventQr
                      ? null
                      : () {
                          setState(() {
                            _eventQrCodeController.text =
                                _generateEventQrCodeValue();
                            _statusMessage = 'Generated a new QR code value.';
                          });
                        },
                  child: const Text('Generate New Code'),
                ),
                OutlinedButton(
                  onPressed: previewCode.isEmpty || _isSavingEventQr
                      ? null
                      : () {
                          _copyEventQrCodeToClipboard(previewCode);
                        },
                  child: const Text('Copy Code'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _eventQrNotesController,
              maxLines: 2,
              style: const TextStyle(color: Colors.white),
              cursorColor: Colors.white,
              decoration: _inputDecoration('Notes (optional)'),
            ),
            SwitchListTile(
              title: const Text('Active QR code'),
              value: _eventQrIsActive,
              onChanged: (bool value) {
                setState(() {
                  _eventQrIsActive = value;
                });
              },
            ),
            if (previewCode.isNotEmpty) ...<Widget>[
              const SizedBox(height: 10),
              Center(
                child: Column(
                  children: <Widget>[
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: QrImageView(
                        data: previewCode,
                        size: 220,
                        backgroundColor: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SelectableText(
                      previewCode,
                      style: const TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                ElevatedButton(
                  onPressed: _isSavingEventQr ? null : _saveEventQrCode,
                  child: Text(_isSavingEventQr ? 'Saving...' : 'Save Event QR'),
                ),
                OutlinedButton(
                  onPressed: _isSavingEventQr ? null : _startNewEventQrCode,
                  child: const Text('New QR Code'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEventQrCodesCard() {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<List<EventQrCode>>(
          stream: _watchEventQrCodes(),
          builder: (BuildContext context,
              AsyncSnapshot<List<EventQrCode>> snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const SizedBox(
                height: 120,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            if (snapshot.hasError) {
              return Text(
                'Failed to load event QR codes: ${snapshot.error}',
                style: const TextStyle(color: Colors.white70),
              );
            }

            final List<EventQrCode> qrCodes = snapshot.data ?? <EventQrCode>[];
            if (qrCodes.isEmpty) {
              return const Text(
                'No event QR codes yet. Create one using the form.',
                style: TextStyle(color: Colors.white70),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Event QR Codes',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                ...qrCodes.map((EventQrCode eventQrCode) {
                  return Card(
                    color: Colors.black.withValues(alpha: 0.35),
                    margin: const EdgeInsets.only(bottom: 10),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            eventQrCode.eventName.isEmpty
                                ? '(Unnamed event)'
                                : eventQrCode.eventName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Active: ${eventQrCode.isActive} | '
                            'Pluto Points: ${eventQrCode.pointsAwarded} | '
                            'Claims: ${eventQrCode.totalClaims}',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          Text(
                            'Updated: ${_formatDate(eventQrCode.updatedAt)}',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          const SizedBox(height: 8),
                          SelectableText(
                            eventQrCode.code,
                            style: const TextStyle(color: Colors.white70),
                          ),
                          if (eventQrCode.code.isNotEmpty) ...<Widget>[
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: QrImageView(
                                data: eventQrCode.code,
                                size: 130,
                                backgroundColor: Colors.white,
                              ),
                            ),
                          ],
                          if (eventQrCode.notes.isNotEmpty) ...<Widget>[
                            const SizedBox(height: 8),
                            Text(
                              eventQrCode.notes,
                              style: const TextStyle(color: Colors.white70),
                            ),
                          ],
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: <Widget>[
                              ElevatedButton(
                                onPressed: () => _editEventQrCode(eventQrCode),
                                child: const Text('Edit'),
                              ),
                              OutlinedButton(
                                onPressed: () => _copyEventQrCodeToClipboard(
                                  eventQrCode.code,
                                ),
                                child: const Text('Copy Code'),
                              ),
                              OutlinedButton(
                                onPressed: () =>
                                    _downloadEventQrCode(eventQrCode),
                                child: const Text('Download QR'),
                              ),
                              OutlinedButton(
                                onPressed: () =>
                                    _deleteEventQrCode(eventQrCode),
                                child: const Text('Delete'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildEventsCard() {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: StreamBuilder<List<CurrentEvent>>(
          stream: _eventsRepository.watchEvents(onlyActive: false),
          builder: (BuildContext context,
              AsyncSnapshot<List<CurrentEvent>> snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const SizedBox(
                height: 120,
                child: Center(child: CircularProgressIndicator()),
              );
            }

            if (snapshot.hasError) {
              return Text(
                'Failed to load events: ${snapshot.error}',
                style: const TextStyle(color: Colors.white70),
              );
            }

            final List<CurrentEvent> events = snapshot.data ?? <CurrentEvent>[];
            if (events.isEmpty) {
              return const Text(
                'No current events found. Create one using the form.',
                style: TextStyle(color: Colors.white70),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'Current Events',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 10),
                ...events.map((CurrentEvent event) {
                  return Card(
                    color: Colors.black.withValues(alpha: 0.35),
                    margin: const EdgeInsets.only(bottom: 10),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            event.title.isEmpty ? '(Untitled)' : event.title,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Active: ${event.isActive} | Sort: ${event.sortOrder}',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          Text(
                            'Updated: ${_formatDate(event.updatedAt)}',
                            style: const TextStyle(color: Colors.white70),
                          ),
                          if (event.details.isNotEmpty) ...<Widget>[
                            const SizedBox(height: 6),
                            Text(
                              event.details,
                              style: const TextStyle(color: Colors.white70),
                            ),
                          ],
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: <Widget>[
                              ElevatedButton(
                                onPressed: () => _editEvent(event),
                                child: const Text('Edit'),
                              ),
                              OutlinedButton(
                                onPressed: () => _deleteEvent(event),
                                child: const Text('Delete'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ],
            );
          },
        ),
      ),
    );
  }

  String _formatDate(DateTime? date) {
    if (date == null) {
      return 'Unknown';
    }
    return DateFormat('yyyy-MM-dd HH:mm').format(date.toLocal());
  }

  String _sanitizeFileSegment(String value) {
    final String normalized = value
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'^_+|_+$'), '');
    if (normalized.isEmpty) {
      return 'event';
    }
    return normalized;
  }

  String _mimeTypeForExtension(String extension) {
    switch (extension.toLowerCase()) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin - Events, Rewards & QR'),
        actions: <Widget>[
          TextButton(
            onPressed: () => context.go('/'),
            child: const Text('Home'),
          ),
          TextButton(
            onPressed: () => context.go('/sign-on'),
            child: const Text('Sign On'),
          ),
        ],
      ),
      body: Stack(
        children: <Widget>[
          const PlasmaRenderer(
            color: Color.fromARGB(68, 85, 0, 165),
            blur: 0.5,
            blendMode: BlendMode.plus,
            particleType: ParticleType.atlas,
            variation1: 1,
          ),
          StreamBuilder<User?>(
            stream: FirebaseAuth.instance.authStateChanges(),
            builder: (BuildContext context, AsyncSnapshot<User?> authSnapshot) {
              if (authSnapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              final User? user = authSnapshot.data;
              if (user == null) {
                return _buildSignedOutState();
              }

              return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection('adminUsers')
                    .doc(user.uid)
                    .snapshots(),
                builder: (BuildContext context,
                    AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>>
                        adminSnapshot) {
                  if (adminSnapshot.connectionState ==
                      ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (adminSnapshot.hasError) {
                    return _buildAdminReadErrorState(
                      user,
                      adminSnapshot.error,
                    );
                  }

                  final bool isAdmin = adminSnapshot.data?.exists ?? false;
                  if (!isAdmin) {
                    return _buildUnauthorizedState(user);
                  }

                  return _buildEditorLayout();
                },
              );
            },
          ),
          if (_isSaving || _isSavingReward || _isSavingEventQr)
            Container(
              color: Colors.black45,
              child: const Center(child: CircularProgressIndicator()),
            ),
          if (_statusMessage.isNotEmpty)
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                margin: const EdgeInsets.all(18),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black87,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _statusMessage,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
