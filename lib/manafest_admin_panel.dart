import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'manafest_repository.dart';

class ManaFestAdminPanel extends StatefulWidget {
  const ManaFestAdminPanel({super.key});

  @override
  State<ManaFestAdminPanel> createState() => _ManaFestAdminPanelState();
}

class _ManaFestAdminPanelState extends State<ManaFestAdminPanel> {
  final ManaFestRepository _repository = ManaFestRepository();

  final TextEditingController _scheduleTitleController =
      TextEditingController();
  final TextEditingController _scheduleArtistController =
      TextEditingController();
  final TextEditingController _scheduleDayController =
      TextEditingController(text: 'Friday');
  final TextEditingController _scheduleStartController =
      TextEditingController();
  final TextEditingController _scheduleEndController = TextEditingController();
  final TextEditingController _scheduleDescriptionController =
      TextEditingController();
  final TextEditingController _scheduleSortController =
      TextEditingController(text: '0');

  final TextEditingController _guideTitleController = TextEditingController();
  final TextEditingController _guideBodyController = TextEditingController();
  final TextEditingController _guideCategoryController =
      TextEditingController();
  final TextEditingController _guideSortController =
      TextEditingController(text: '0');

  final TextEditingController _updateTitleController = TextEditingController();
  final TextEditingController _updateBodyController = TextEditingController();
  final TextEditingController _updateSortController =
      TextEditingController(text: '0');

  final TextEditingController _artistNameController = TextEditingController();
  final TextEditingController _artistBioController = TextEditingController();
  final TextEditingController _artistGenresController = TextEditingController();
  final TextEditingController _artistImageUrlController =
      TextEditingController();
  final TextEditingController _artistSortController =
      TextEditingController(text: '0');

  final TextEditingController _mapPinTitleController = TextEditingController();
  final TextEditingController _mapPinDescriptionController =
      TextEditingController();
  final TextEditingController _mapPinTypeController =
      TextEditingController(text: 'Stage');
  final TextEditingController _mapPinLocationController =
      TextEditingController();
  final TextEditingController _mapPinSortController =
      TextEditingController(text: '0');

  String? _editingScheduleId;
  String? _editingGuideId;
  String? _editingUpdateId;
  String? _editingArtistId;
  String? _editingMapPinId;

  String _scheduleStage = manaFestMainStage;
  bool _scheduleIsActive = true;
  bool _scheduleIsPublished = true;
  bool _guideIsActive = true;
  bool _updateIsUrgent = false;
  bool _updateIsActive = true;
  bool _artistIsActive = true;
  bool _artistIsPublished = false;
  bool _mapPinIsActive = true;
  bool _mapPinIsPublished = false;

  bool _isSavingSettings = false;
  bool _isSavingSchedule = false;
  bool _isSavingGuide = false;
  bool _isSavingUpdate = false;
  bool _isSavingArtist = false;
  bool _isSavingMapPin = false;
  String _statusMessage = '';

  bool get _isBusy =>
      _isSavingSettings ||
      _isSavingSchedule ||
      _isSavingGuide ||
      _isSavingUpdate ||
      _isSavingArtist ||
      _isSavingMapPin;

  @override
  void dispose() {
    _scheduleTitleController.dispose();
    _scheduleArtistController.dispose();
    _scheduleDayController.dispose();
    _scheduleStartController.dispose();
    _scheduleEndController.dispose();
    _scheduleDescriptionController.dispose();
    _scheduleSortController.dispose();
    _guideTitleController.dispose();
    _guideBodyController.dispose();
    _guideCategoryController.dispose();
    _guideSortController.dispose();
    _updateTitleController.dispose();
    _updateBodyController.dispose();
    _updateSortController.dispose();
    _artistNameController.dispose();
    _artistBioController.dispose();
    _artistGenresController.dispose();
    _artistImageUrlController.dispose();
    _artistSortController.dispose();
    _mapPinTitleController.dispose();
    _mapPinDescriptionController.dispose();
    _mapPinTypeController.dispose();
    _mapPinLocationController.dispose();
    _mapPinSortController.dispose();
    super.dispose();
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

  Widget _textField({
    required TextEditingController controller,
    required String label,
    int maxLines = 1,
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      style: const TextStyle(color: Colors.white),
      cursorColor: Colors.white,
      decoration: _inputDecoration(label),
    );
  }

  Widget _panelCard({
    required Widget child,
  }) {
    return Card(
      color: Colors.black.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    );
  }

  List<Widget> _withSpacing(List<Widget> children) {
    final List<Widget> spaced = <Widget>[];
    for (int i = 0; i < children.length; i++) {
      if (i > 0) {
        spaced.add(const SizedBox(height: 12));
      }
      spaced.add(children[i]);
    }
    return spaced;
  }

  int? _parseSortOrder(TextEditingController controller) {
    return int.tryParse(controller.text.trim());
  }

  String _formatDate(DateTime? value) {
    if (value == null) {
      return 'Unknown';
    }
    return DateFormat('yyyy-MM-dd HH:mm').format(value.toLocal());
  }

  Future<bool> _confirmDelete({
    required String title,
    required String body,
  }) async {
    final bool? shouldDelete = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: Text(title),
          content: Text(body),
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
    return shouldDelete == true;
  }

  Future<void> _saveSettings({
    required bool isLineupPublished,
    required bool isMapPublished,
  }) async {
    setState(() {
      _isSavingSettings = true;
      _statusMessage = '';
    });

    try {
      await _repository.saveSettings(
        isLineupPublished: isLineupPublished,
        isMapPublished: isMapPublished,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'ManaFest publish settings saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save settings: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingSettings = false;
        });
      }
    }
  }

  Future<void> _saveScheduleItem() async {
    final String title = _scheduleTitleController.text.trim();
    final String artistName = _scheduleArtistController.text.trim();
    if (title.isEmpty && artistName.isEmpty) {
      setState(() {
        _statusMessage = 'Schedule title or artist is required.';
      });
      return;
    }

    final int? sortOrder = _parseSortOrder(_scheduleSortController);
    if (sortOrder == null) {
      setState(() {
        _statusMessage = 'Schedule sort order must be a number.';
      });
      return;
    }

    setState(() {
      _isSavingSchedule = true;
      _statusMessage = '';
    });

    try {
      final String id = await _repository.saveScheduleItem(
        id: _editingScheduleId,
        title: title,
        artistName: artistName,
        stage: _scheduleStage,
        dayLabel: _scheduleDayController.text,
        startTimeLabel: _scheduleStartController.text,
        endTimeLabel: _scheduleEndController.text,
        description: _scheduleDescriptionController.text,
        isActive: _scheduleIsActive,
        isPublished: _scheduleIsPublished,
        sortOrder: sortOrder,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _editingScheduleId = id;
        _statusMessage = 'Schedule item saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save schedule item: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingSchedule = false;
        });
      }
    }
  }

  Future<void> _saveGuideSection() async {
    final String title = _guideTitleController.text.trim();
    if (title.isEmpty) {
      setState(() {
        _statusMessage = 'Guide title is required.';
      });
      return;
    }

    final int? sortOrder = _parseSortOrder(_guideSortController);
    if (sortOrder == null) {
      setState(() {
        _statusMessage = 'Guide sort order must be a number.';
      });
      return;
    }

    setState(() {
      _isSavingGuide = true;
      _statusMessage = '';
    });

    try {
      final String id = await _repository.saveGuideSection(
        id: _editingGuideId,
        title: title,
        body: _guideBodyController.text,
        category: _guideCategoryController.text,
        isActive: _guideIsActive,
        sortOrder: sortOrder,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _editingGuideId = id;
        _statusMessage = 'Guide section saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save guide section: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingGuide = false;
        });
      }
    }
  }

  Future<void> _saveUpdate() async {
    final String title = _updateTitleController.text.trim();
    if (title.isEmpty) {
      setState(() {
        _statusMessage = 'Update title is required.';
      });
      return;
    }

    final int? sortOrder = _parseSortOrder(_updateSortController);
    if (sortOrder == null) {
      setState(() {
        _statusMessage = 'Update sort order must be a number.';
      });
      return;
    }

    setState(() {
      _isSavingUpdate = true;
      _statusMessage = '';
    });

    try {
      final String id = await _repository.saveUpdate(
        id: _editingUpdateId,
        title: title,
        body: _updateBodyController.text,
        isUrgent: _updateIsUrgent,
        isActive: _updateIsActive,
        sortOrder: sortOrder,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _editingUpdateId = id;
        _statusMessage = 'ManaFest update saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save update: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingUpdate = false;
        });
      }
    }
  }

  Future<void> _saveArtist() async {
    final String name = _artistNameController.text.trim();
    if (name.isEmpty) {
      setState(() {
        _statusMessage = 'Artist name is required.';
      });
      return;
    }

    final int? sortOrder = _parseSortOrder(_artistSortController);
    if (sortOrder == null) {
      setState(() {
        _statusMessage = 'Artist sort order must be a number.';
      });
      return;
    }

    setState(() {
      _isSavingArtist = true;
      _statusMessage = '';
    });

    try {
      final String id = await _repository.saveArtist(
        id: _editingArtistId,
        name: name,
        bio: _artistBioController.text,
        genres: _artistGenresController.text,
        imageUrl: _artistImageUrlController.text,
        isActive: _artistIsActive,
        isPublished: _artistIsPublished,
        sortOrder: sortOrder,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _editingArtistId = id;
        _statusMessage = 'Artist saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save artist: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingArtist = false;
        });
      }
    }
  }

  Future<void> _saveMapPin() async {
    final String title = _mapPinTitleController.text.trim();
    if (title.isEmpty) {
      setState(() {
        _statusMessage = 'Map pin title is required.';
      });
      return;
    }

    final int? sortOrder = _parseSortOrder(_mapPinSortController);
    if (sortOrder == null) {
      setState(() {
        _statusMessage = 'Map pin sort order must be a number.';
      });
      return;
    }

    setState(() {
      _isSavingMapPin = true;
      _statusMessage = '';
    });

    try {
      final String id = await _repository.saveMapPin(
        id: _editingMapPinId,
        title: title,
        description: _mapPinDescriptionController.text,
        pinType: _mapPinTypeController.text,
        locationNote: _mapPinLocationController.text,
        isActive: _mapPinIsActive,
        isPublished: _mapPinIsPublished,
        sortOrder: sortOrder,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _editingMapPinId = id;
        _statusMessage = 'Map pin saved.';
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _statusMessage = 'Failed to save map pin: $error';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSavingMapPin = false;
        });
      }
    }
  }

  void _editScheduleItem(ManaFestScheduleItem item) {
    setState(() {
      _editingScheduleId = item.id;
      _scheduleTitleController.text = item.title;
      _scheduleArtistController.text = item.artistName;
      _scheduleDayController.text = item.dayLabel;
      _scheduleStartController.text = item.startTimeLabel;
      _scheduleEndController.text = item.endTimeLabel;
      _scheduleDescriptionController.text = item.description;
      _scheduleSortController.text = item.sortOrder.toString();
      _scheduleStage = item.stage;
      _scheduleIsActive = item.isActive;
      _scheduleIsPublished = item.isPublished;
      _statusMessage = 'Editing ${item.displayTitle}.';
    });
  }

  void _startNewScheduleItem() {
    setState(() {
      _editingScheduleId = null;
      _scheduleTitleController.clear();
      _scheduleArtistController.clear();
      _scheduleDayController.text = 'Friday';
      _scheduleStartController.clear();
      _scheduleEndController.clear();
      _scheduleDescriptionController.clear();
      _scheduleSortController.text = '0';
      _scheduleStage = manaFestMainStage;
      _scheduleIsActive = true;
      _scheduleIsPublished = true;
      _statusMessage = 'New schedule item form ready.';
    });
  }

  void _editGuideSection(ManaFestGuideSection section) {
    setState(() {
      _editingGuideId = section.id;
      _guideTitleController.text = section.title;
      _guideBodyController.text = section.body;
      _guideCategoryController.text = section.category;
      _guideSortController.text = section.sortOrder.toString();
      _guideIsActive = section.isActive;
      _statusMessage = 'Editing ${section.title}.';
    });
  }

  void _startNewGuideSection() {
    setState(() {
      _editingGuideId = null;
      _guideTitleController.clear();
      _guideBodyController.clear();
      _guideCategoryController.clear();
      _guideSortController.text = '0';
      _guideIsActive = true;
      _statusMessage = 'New guide section form ready.';
    });
  }

  void _editUpdate(ManaFestUpdate update) {
    setState(() {
      _editingUpdateId = update.id;
      _updateTitleController.text = update.title;
      _updateBodyController.text = update.body;
      _updateSortController.text = update.sortOrder.toString();
      _updateIsUrgent = update.isUrgent;
      _updateIsActive = update.isActive;
      _statusMessage = 'Editing ${update.title}.';
    });
  }

  void _startNewUpdate() {
    setState(() {
      _editingUpdateId = null;
      _updateTitleController.clear();
      _updateBodyController.clear();
      _updateSortController.text = '0';
      _updateIsUrgent = false;
      _updateIsActive = true;
      _statusMessage = 'New update form ready.';
    });
  }

  void _editArtist(ManaFestArtist artist) {
    setState(() {
      _editingArtistId = artist.id;
      _artistNameController.text = artist.name;
      _artistBioController.text = artist.bio;
      _artistGenresController.text = artist.genres;
      _artistImageUrlController.text = artist.imageUrl;
      _artistSortController.text = artist.sortOrder.toString();
      _artistIsActive = artist.isActive;
      _artistIsPublished = artist.isPublished;
      _statusMessage = 'Editing ${artist.name}.';
    });
  }

  void _startNewArtist() {
    setState(() {
      _editingArtistId = null;
      _artistNameController.clear();
      _artistBioController.clear();
      _artistGenresController.clear();
      _artistImageUrlController.clear();
      _artistSortController.text = '0';
      _artistIsActive = true;
      _artistIsPublished = false;
      _statusMessage = 'New artist form ready.';
    });
  }

  void _editMapPin(ManaFestMapPin mapPin) {
    setState(() {
      _editingMapPinId = mapPin.id;
      _mapPinTitleController.text = mapPin.title;
      _mapPinDescriptionController.text = mapPin.description;
      _mapPinTypeController.text = mapPin.pinType;
      _mapPinLocationController.text = mapPin.locationNote;
      _mapPinSortController.text = mapPin.sortOrder.toString();
      _mapPinIsActive = mapPin.isActive;
      _mapPinIsPublished = mapPin.isPublished;
      _statusMessage = 'Editing ${mapPin.title}.';
    });
  }

  void _startNewMapPin() {
    setState(() {
      _editingMapPinId = null;
      _mapPinTitleController.clear();
      _mapPinDescriptionController.clear();
      _mapPinTypeController.text = 'Stage';
      _mapPinLocationController.clear();
      _mapPinSortController.text = '0';
      _mapPinIsActive = true;
      _mapPinIsPublished = false;
      _statusMessage = 'New map pin form ready.';
    });
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Text(
            'ManaFest Control Center',
            style: TextStyle(
              color: Colors.white,
              fontSize: 30,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Manage attendee tools, hidden lineup data, and hidden map data for the ManaFest app tab.',
            style: TextStyle(color: Colors.white70),
          ),
          if (_statusMessage.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.48),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.white24),
              ),
              child: Text(
                _statusMessage,
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSettingsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        _panelCard(
          child: StreamBuilder<ManaFestSettings>(
            stream: _repository.watchSettings(),
            builder: (BuildContext context,
                AsyncSnapshot<ManaFestSettings> snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return const SizedBox(
                  height: 120,
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              if (snapshot.hasError) {
                return Text(
                  'Failed to load settings: ${snapshot.error}',
                  style: const TextStyle(color: Colors.white70),
                );
              }

              final ManaFestSettings settings =
                  snapshot.data ?? ManaFestSettings.defaults;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text(
                    'Publish Controls',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Lineup and map data can be entered now. These switches control whether attendees can see those surfaces later.',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  SwitchListTile(
                    title: const Text('Lineup visible to attendees'),
                    subtitle: const Text(
                      'Keep off until the lineup is ready.',
                    ),
                    value: settings.isLineupPublished,
                    onChanged: _isSavingSettings
                        ? null
                        : (bool value) => _saveSettings(
                              isLineupPublished: value,
                              isMapPublished: settings.isMapPublished,
                            ),
                  ),
                  SwitchListTile(
                    title: const Text('Map visible to attendees'),
                    subtitle: const Text(
                      'Keep off until map pins and the Renegade Stage reveal are ready.',
                    ),
                    value: settings.isMapPublished,
                    onChanged: _isSavingSettings
                        ? null
                        : (bool value) => _saveSettings(
                              isLineupPublished: settings.isLineupPublished,
                              isMapPublished: value,
                            ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Last updated: ${_formatDate(settings.updatedAt)}',
                    style: const TextStyle(color: Colors.white54),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildScheduleTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _withSpacing(<Widget>[
        _buildScheduleEditorCard(),
        _buildScheduleItemsCard(),
      ]),
    );
  }

  Widget _buildScheduleEditorCard() {
    return _panelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _withSpacing(<Widget>[
          Text(
            _editingScheduleId == null ? 'Create Schedule Item' : 'Edit Set',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          _textField(controller: _scheduleTitleController, label: 'Set Title'),
          _textField(
            controller: _scheduleArtistController,
            label: 'Artist Name',
          ),
          DropdownButtonFormField<String>(
            initialValue: _scheduleStage,
            dropdownColor: const Color(0xFF181818),
            decoration: _inputDecoration('Stage'),
            items: manaFestStageValues
                .map(
                  (String stage) => DropdownMenuItem<String>(
                    value: stage,
                    child: Text(stage),
                  ),
                )
                .toList(),
            onChanged: _isSavingSchedule
                ? null
                : (String? value) {
                    setState(() {
                      _scheduleStage =
                          normalizeManaFestStage(value ?? manaFestMainStage);
                    });
                  },
          ),
          _textField(controller: _scheduleDayController, label: 'Day'),
          Row(
            children: <Widget>[
              Expanded(
                child: _textField(
                  controller: _scheduleStartController,
                  label: 'Start Time',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _textField(
                  controller: _scheduleEndController,
                  label: 'End Time',
                ),
              ),
            ],
          ),
          _textField(
            controller: _scheduleDescriptionController,
            label: 'Description',
            maxLines: 3,
          ),
          _textField(
            controller: _scheduleSortController,
            label: 'Sort Order',
            keyboardType: TextInputType.number,
          ),
          SwitchListTile(
            title: const Text('Active schedule item'),
            value: _scheduleIsActive,
            onChanged: (bool value) {
              setState(() {
                _scheduleIsActive = value;
              });
            },
          ),
          SwitchListTile(
            title: const Text('Published in attendee schedule'),
            value: _scheduleIsPublished,
            onChanged: (bool value) {
              setState(() {
                _scheduleIsPublished = value;
              });
            },
          ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              ElevatedButton(
                onPressed: _isSavingSchedule ? null : _saveScheduleItem,
                child: Text(_isSavingSchedule ? 'Saving...' : 'Save Set'),
              ),
              OutlinedButton(
                onPressed: _isSavingSchedule ? null : _startNewScheduleItem,
                child: const Text('New Set'),
              ),
            ],
          ),
        ]),
      ),
    );
  }

  Widget _buildScheduleItemsCard() {
    return _panelCard(
      child: StreamBuilder<List<ManaFestScheduleItem>>(
        stream: _repository.watchScheduleItems(attendeeOnly: false),
        builder: (BuildContext context,
            AsyncSnapshot<List<ManaFestScheduleItem>> snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 120,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError) {
            return Text(
              'Failed to load schedule: ${snapshot.error}',
              style: const TextStyle(color: Colors.white70),
            );
          }
          final List<ManaFestScheduleItem> items =
              snapshot.data ?? <ManaFestScheduleItem>[];
          if (items.isEmpty) {
            return const Text(
              'No schedule items yet.',
              style: TextStyle(color: Colors.white70),
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Text(
                'Schedule Items',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 10),
              ...items.map(_buildScheduleItemTile),
            ],
          );
        },
      ),
    );
  }

  Widget _buildScheduleItemTile(ManaFestScheduleItem item) {
    return _adminListTile(
      title: item.displayTitle,
      metadata:
          '${item.stage} | ${item.dayLabel.isEmpty ? 'Day TBA' : item.dayLabel} | ${item.timeRangeLabel}',
      detail:
          'Active: ${item.isActive} | Published: ${item.isPublished} | Sort: ${item.sortOrder}',
      description: item.description,
      onEdit: () => _editScheduleItem(item),
      onDelete: () async {
        final bool confirmed = await _confirmDelete(
          title: 'Delete Schedule Item?',
          body: 'Delete "${item.displayTitle}" from the ManaFest schedule?',
        );
        if (!confirmed) {
          return;
        }
        await _repository.deleteScheduleItem(item.id);
        if (!mounted) {
          return;
        }
        if (_editingScheduleId == item.id) {
          _startNewScheduleItem();
        }
        setState(() {
          _statusMessage = 'Schedule item deleted.';
        });
      },
    );
  }

  Widget _buildGuideTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _withSpacing(<Widget>[
        _buildGuideEditorCard(),
        _buildGuideSectionsCard(),
      ]),
    );
  }

  Widget _buildGuideEditorCard() {
    return _panelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _withSpacing(<Widget>[
          Text(
            _editingGuideId == null
                ? 'Create Guide Section'
                : 'Edit Guide Section',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          _textField(controller: _guideTitleController, label: 'Title'),
          _textField(
            controller: _guideCategoryController,
            label: 'Category',
          ),
          _textField(
            controller: _guideBodyController,
            label: 'Body',
            maxLines: 5,
          ),
          _textField(
            controller: _guideSortController,
            label: 'Sort Order',
            keyboardType: TextInputType.number,
          ),
          SwitchListTile(
            title: const Text('Active guide section'),
            value: _guideIsActive,
            onChanged: (bool value) {
              setState(() {
                _guideIsActive = value;
              });
            },
          ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              ElevatedButton(
                onPressed: _isSavingGuide ? null : _saveGuideSection,
                child: Text(_isSavingGuide ? 'Saving...' : 'Save Guide'),
              ),
              OutlinedButton(
                onPressed: _isSavingGuide ? null : _startNewGuideSection,
                child: const Text('New Guide'),
              ),
            ],
          ),
        ]),
      ),
    );
  }

  Widget _buildGuideSectionsCard() {
    return _buildGenericListCard<ManaFestGuideSection>(
      title: 'Guide Sections',
      emptyText: 'No guide sections yet.',
      stream: _repository.watchGuideSections(attendeeOnly: false),
      itemBuilder: (ManaFestGuideSection section) => _adminListTile(
        title: section.title.isEmpty ? '(Untitled guide)' : section.title,
        metadata: section.category.isEmpty ? 'General' : section.category,
        detail:
            'Active: ${section.isActive} | Sort: ${section.sortOrder} | Updated: ${_formatDate(section.updatedAt)}',
        description: section.body,
        onEdit: () => _editGuideSection(section),
        onDelete: () async {
          final bool confirmed = await _confirmDelete(
            title: 'Delete Guide Section?',
            body: 'Delete "${section.title}" from ManaFest guide content?',
          );
          if (!confirmed) {
            return;
          }
          await _repository.deleteGuideSection(section.id);
          if (!mounted) {
            return;
          }
          if (_editingGuideId == section.id) {
            _startNewGuideSection();
          }
          setState(() {
            _statusMessage = 'Guide section deleted.';
          });
        },
      ),
    );
  }

  Widget _buildUpdatesTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _withSpacing(<Widget>[
        _buildUpdateEditorCard(),
        _buildUpdatesCard(),
      ]),
    );
  }

  Widget _buildUpdateEditorCard() {
    return _panelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _withSpacing(<Widget>[
          Text(
            _editingUpdateId == null ? 'Create Update' : 'Edit Update',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          const Text(
            'Urgent updates should also be sent through the existing notification workflow when needed.',
            style: TextStyle(color: Colors.white70),
          ),
          _textField(controller: _updateTitleController, label: 'Title'),
          _textField(
            controller: _updateBodyController,
            label: 'Body',
            maxLines: 4,
          ),
          _textField(
            controller: _updateSortController,
            label: 'Sort Order',
            keyboardType: TextInputType.number,
          ),
          SwitchListTile(
            title: const Text('Urgent update'),
            value: _updateIsUrgent,
            onChanged: (bool value) {
              setState(() {
                _updateIsUrgent = value;
              });
            },
          ),
          SwitchListTile(
            title: const Text('Active update'),
            value: _updateIsActive,
            onChanged: (bool value) {
              setState(() {
                _updateIsActive = value;
              });
            },
          ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              ElevatedButton(
                onPressed: _isSavingUpdate ? null : _saveUpdate,
                child: Text(_isSavingUpdate ? 'Saving...' : 'Save Update'),
              ),
              OutlinedButton(
                onPressed: _isSavingUpdate ? null : _startNewUpdate,
                child: const Text('New Update'),
              ),
            ],
          ),
        ]),
      ),
    );
  }

  Widget _buildUpdatesCard() {
    return _buildGenericListCard<ManaFestUpdate>(
      title: 'Updates',
      emptyText: 'No ManaFest updates yet.',
      stream: _repository.watchUpdates(attendeeOnly: false),
      itemBuilder: (ManaFestUpdate update) => _adminListTile(
        title: update.title.isEmpty ? '(Untitled update)' : update.title,
        metadata: update.isUrgent ? 'Urgent' : 'Normal',
        detail:
            'Active: ${update.isActive} | Sort: ${update.sortOrder} | Updated: ${_formatDate(update.updatedAt)}',
        description: update.body,
        onEdit: () => _editUpdate(update),
        onDelete: () async {
          final bool confirmed = await _confirmDelete(
            title: 'Delete Update?',
            body: 'Delete "${update.title}" from ManaFest updates?',
          );
          if (!confirmed) {
            return;
          }
          await _repository.deleteUpdate(update.id);
          if (!mounted) {
            return;
          }
          if (_editingUpdateId == update.id) {
            _startNewUpdate();
          }
          setState(() {
            _statusMessage = 'Update deleted.';
          });
        },
      ),
    );
  }

  Widget _buildArtistsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _withSpacing(<Widget>[
        _hiddenSurfaceNotice(
          'Lineup is hidden from attendees until Publish Controls enables it.',
        ),
        _buildArtistEditorCard(),
        _buildArtistsCard(),
      ]),
    );
  }

  Widget _buildArtistEditorCard() {
    return _panelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _withSpacing(<Widget>[
          Text(
            _editingArtistId == null ? 'Create Artist' : 'Edit Artist',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          _textField(controller: _artistNameController, label: 'Artist Name'),
          _textField(controller: _artistGenresController, label: 'Genres'),
          _textField(
            controller: _artistBioController,
            label: 'Bio',
            maxLines: 4,
          ),
          _textField(
            controller: _artistImageUrlController,
            label: 'Image URL',
          ),
          _textField(
            controller: _artistSortController,
            label: 'Sort Order',
            keyboardType: TextInputType.number,
          ),
          SwitchListTile(
            title: const Text('Active artist'),
            value: _artistIsActive,
            onChanged: (bool value) {
              setState(() {
                _artistIsActive = value;
              });
            },
          ),
          SwitchListTile(
            title: const Text('Published in lineup data'),
            value: _artistIsPublished,
            onChanged: (bool value) {
              setState(() {
                _artistIsPublished = value;
              });
            },
          ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              ElevatedButton(
                onPressed: _isSavingArtist ? null : _saveArtist,
                child: Text(_isSavingArtist ? 'Saving...' : 'Save Artist'),
              ),
              OutlinedButton(
                onPressed: _isSavingArtist ? null : _startNewArtist,
                child: const Text('New Artist'),
              ),
            ],
          ),
        ]),
      ),
    );
  }

  Widget _buildArtistsCard() {
    return _buildGenericListCard<ManaFestArtist>(
      title: 'Artists',
      emptyText: 'No artists yet.',
      stream: _repository.watchArtists(attendeeOnly: false),
      itemBuilder: (ManaFestArtist artist) => _adminListTile(
        title: artist.name.isEmpty ? '(Unnamed artist)' : artist.name,
        metadata: artist.genres.isEmpty ? 'Genre TBA' : artist.genres,
        detail:
            'Active: ${artist.isActive} | Published: ${artist.isPublished} | Sort: ${artist.sortOrder}',
        description: artist.bio,
        onEdit: () => _editArtist(artist),
        onDelete: () async {
          final bool confirmed = await _confirmDelete(
            title: 'Delete Artist?',
            body: 'Delete "${artist.name}" from ManaFest artist data?',
          );
          if (!confirmed) {
            return;
          }
          await _repository.deleteArtist(artist.id);
          if (!mounted) {
            return;
          }
          if (_editingArtistId == artist.id) {
            _startNewArtist();
          }
          setState(() {
            _statusMessage = 'Artist deleted.';
          });
        },
      ),
    );
  }

  Widget _buildMapPinsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: _withSpacing(<Widget>[
        _hiddenSurfaceNotice(
          'Map is hidden from attendees until Publish Controls enables it. Keep the Renegade Stage location unpublished until reveal.',
        ),
        _buildMapPinEditorCard(),
        _buildMapPinsCard(),
      ]),
    );
  }

  Widget _buildMapPinEditorCard() {
    return _panelCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _withSpacing(<Widget>[
          Text(
            _editingMapPinId == null ? 'Create Map Pin' : 'Edit Map Pin',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.bold,
            ),
          ),
          _textField(controller: _mapPinTitleController, label: 'Pin Title'),
          _textField(controller: _mapPinTypeController, label: 'Pin Type'),
          _textField(
            controller: _mapPinDescriptionController,
            label: 'Description',
            maxLines: 3,
          ),
          _textField(
            controller: _mapPinLocationController,
            label: 'Location Note',
            maxLines: 2,
          ),
          _textField(
            controller: _mapPinSortController,
            label: 'Sort Order',
            keyboardType: TextInputType.number,
          ),
          SwitchListTile(
            title: const Text('Active map pin'),
            value: _mapPinIsActive,
            onChanged: (bool value) {
              setState(() {
                _mapPinIsActive = value;
              });
            },
          ),
          SwitchListTile(
            title: const Text('Published in map data'),
            value: _mapPinIsPublished,
            onChanged: (bool value) {
              setState(() {
                _mapPinIsPublished = value;
              });
            },
          ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              ElevatedButton(
                onPressed: _isSavingMapPin ? null : _saveMapPin,
                child: Text(_isSavingMapPin ? 'Saving...' : 'Save Map Pin'),
              ),
              OutlinedButton(
                onPressed: _isSavingMapPin ? null : _startNewMapPin,
                child: const Text('New Map Pin'),
              ),
            ],
          ),
        ]),
      ),
    );
  }

  Widget _buildMapPinsCard() {
    return _buildGenericListCard<ManaFestMapPin>(
      title: 'Map Pins',
      emptyText: 'No map pins yet.',
      stream: _repository.watchMapPins(attendeeOnly: false),
      itemBuilder: (ManaFestMapPin mapPin) => _adminListTile(
        title: mapPin.title.isEmpty ? '(Untitled map pin)' : mapPin.title,
        metadata: mapPin.pinType.isEmpty ? 'General' : mapPin.pinType,
        detail:
            'Active: ${mapPin.isActive} | Published: ${mapPin.isPublished} | Sort: ${mapPin.sortOrder}',
        description: [
          mapPin.description,
          if (mapPin.locationNote.isNotEmpty)
            'Location note: ${mapPin.locationNote}',
        ].where((String value) => value.trim().isNotEmpty).join('\n'),
        onEdit: () => _editMapPin(mapPin),
        onDelete: () async {
          final bool confirmed = await _confirmDelete(
            title: 'Delete Map Pin?',
            body: 'Delete "${mapPin.title}" from ManaFest map data?',
          );
          if (!confirmed) {
            return;
          }
          await _repository.deleteMapPin(mapPin.id);
          if (!mounted) {
            return;
          }
          if (_editingMapPinId == mapPin.id) {
            _startNewMapPin();
          }
          setState(() {
            _statusMessage = 'Map pin deleted.';
          });
        },
      ),
    );
  }

  Widget _hiddenSurfaceNotice(String message) {
    return _panelCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.visibility_off_outlined, color: Colors.white70),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: Colors.white70, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _adminListTile({
    required String title,
    required String metadata,
    required String detail,
    required String description,
    required VoidCallback onEdit,
    required Future<void> Function() onDelete,
  }) {
    return Card(
      color: Colors.black.withValues(alpha: 0.34),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(metadata, style: const TextStyle(color: Colors.white70)),
            Text(detail, style: const TextStyle(color: Colors.white70)),
            if (description.trim().isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              Text(
                description,
                style: const TextStyle(color: Colors.white70, height: 1.35),
              ),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: <Widget>[
                ElevatedButton(
                  onPressed: onEdit,
                  child: const Text('Edit'),
                ),
                OutlinedButton(
                  onPressed: _isBusy ? null : onDelete,
                  child: const Text('Delete'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGenericListCard<T>({
    required String title,
    required String emptyText,
    required Stream<List<T>> stream,
    required Widget Function(T item) itemBuilder,
  }) {
    return _panelCard(
      child: StreamBuilder<List<T>>(
        stream: stream,
        builder: (BuildContext context, AsyncSnapshot<List<T>> snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const SizedBox(
              height: 120,
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (snapshot.hasError) {
            return Text(
              'Failed to load $title: ${snapshot.error}',
              style: const TextStyle(color: Colors.white70),
            );
          }
          final List<T> items = snapshot.data ?? <T>[];
          if (items.isEmpty) {
            return Text(
              emptyText,
              style: const TextStyle(color: Colors.white70),
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 10),
              ...items.map(itemBuilder),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1200),
        child: DefaultTabController(
          length: 6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _buildHeader(),
              const TabBar(
                isScrollable: true,
                tabs: <Widget>[
                  Tab(icon: Icon(Icons.tune), text: 'Settings'),
                  Tab(icon: Icon(Icons.schedule), text: 'Schedule'),
                  Tab(icon: Icon(Icons.article_outlined), text: 'Guide'),
                  Tab(icon: Icon(Icons.campaign_outlined), text: 'Updates'),
                  Tab(icon: Icon(Icons.music_note), text: 'Artists'),
                  Tab(icon: Icon(Icons.map_outlined), text: 'Map Pins'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  children: <Widget>[
                    _buildSettingsTab(),
                    _buildScheduleTab(),
                    _buildGuideTab(),
                    _buildUpdatesTab(),
                    _buildArtistsTab(),
                    _buildMapPinsTab(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
