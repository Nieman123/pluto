import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import 'public_media_repository.dart';
import 'rentals_repository.dart';

class RentalsAdminPanel extends StatefulWidget {
  const RentalsAdminPanel({super.key});
  @override
  State<RentalsAdminPanel> createState() => _RentalsAdminPanelState();
}

class _RentalsAdminPanelState extends State<RentalsAdminPanel> {
  final RentalsRepository _repository = RentalsRepository();
  final PublicMediaRepository _media = PublicMediaRepository();
  final _form = GlobalKey<FormState>();
  final _scroll = ScrollController();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _category = TextEditingController(text: 'Sound');
  final _quantity = TextEditingController(text: '1');
  final _sort = TextEditingController(text: '0');
  final _productUrl = TextEditingController();
  final _imageUrl = TextEditingController();
  final _price = TextEditingController();
  final _priceUnit = TextEditingController();
  late Future<void> _initialization;
  late final Stream<List<RentalItem>> _items;
  String? _editingId;
  String _priceMode = 'quote';
  bool _isActive = true;
  bool _busy = false;
  String _imageStoragePath = '';
  Uint8List? _imageBytes;
  String? _imageDataUrl;

  @override
  void initState() {
    super.initState();
    _initialization = _repository.seedInitialInventory();
    _items = _repository.watchItems();
  }

  @override
  void dispose() {
    _scroll.dispose();
    for (final controller in [
      _title,
      _description,
      _category,
      _quantity,
      _sort,
      _productUrl,
      _imageUrl,
      _price,
      _priceUnit
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _message(String text) {
    if (mounted)
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  void _edit(RentalItem? item) {
    _form.currentState?.reset();
    setState(() {
      _editingId = item?.id;
      _title.text = item?.title ?? '';
      _description.text = item?.description ?? '';
      _category.text = item?.category ?? 'Sound';
      _quantity.text = '${item?.quantity ?? 1}';
      _sort.text = '${item?.sortOrder ?? 0}';
      _productUrl.text = item?.productUrl ?? '';
      _imageUrl.text = item?.imageUrl ?? '';
      _imageStoragePath = item?.imageStoragePath ?? '';
      _priceMode = item?.priceMode ?? 'quote';
      _price.text = item?.priceCents == null
          ? ''
          : (item!.priceCents! / 100).toStringAsFixed(2);
      _priceUnit.text = item?.priceUnit ?? '';
      _isActive = item?.isActive ?? true;
      _imageBytes = null;
      _imageDataUrl = null;
    });
    if (_scroll.hasClients) {
      _scroll.animateTo(0,
          duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  String? _urlValidator(String? value) {
    if (value == null || value.trim().isEmpty) return null;
    final Uri? uri = Uri.tryParse(value.trim());
    if (uri == null ||
        !['https', 'http'].contains(uri.scheme) ||
        uri.host.isEmpty) return 'Enter a full http or https URL.';
    return null;
  }

  Future<void> _pickImage() async {
    try {
      final result = await FilePicker.platform.pickFiles(
          type: FileType.custom,
          allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
          withData: true);
      if (!mounted || result == null || result.files.isEmpty) return;
      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null ||
          bytes.lengthInBytes > PublicMediaRepository.maxImageBytes) {
        _message('Choose an image 5 MB or smaller.');
        return;
      }
      final extension = (file.extension ?? '').toLowerCase();
      final mime = extension == 'png'
          ? 'image/png'
          : extension == 'webp'
              ? 'image/webp'
              : 'image/jpeg';
      setState(() {
        _imageBytes = bytes;
        _imageDataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      });
    } catch (_) {
      _message('Could not select a photo. Please try again.');
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final id = _editingId ?? _repository.newItemId();
      String imageUrl = _imageUrl.text.trim();
      String imageStoragePath = _imageStoragePath;
      if (_imageDataUrl != null) {
        final upload = await _media.uploadRentalImage(
            rentalId: id, dataUrl: _imageDataUrl!);
        imageUrl = upload.downloadUrl;
        imageStoragePath = upload.storagePath;
        // Keep a completed upload if saving the document needs to be retried.
        if (mounted)
          setState(() {
            _imageUrl.text = imageUrl;
            _imageStoragePath = imageStoragePath;
            _imageDataUrl = null;
            _editingId = id;
          });
      }
      await _repository.saveItem(id, <String, dynamic>{
        'title': _title.text.trim(),
        'description': _description.text.trim(),
        'category': _category.text.trim(),
        'quantity': int.parse(_quantity.text.trim()),
        'sortOrder': int.parse(_sort.text.trim()),
        'productUrl': _productUrl.text.trim(),
        'imageUrl': imageUrl,
        'imageStoragePath': imageStoragePath,
        'priceMode': _priceMode,
        'priceCents':
            _priceMode == 'price' ? rentalPriceCents(_price.text) : null,
        'priceUnit': _priceMode == 'price' ? _priceUnit.text.trim() : '',
        'isActive': _isActive,
      });
      if (mounted) setState(() => _editingId = id);
      _message('Rental saved. Public updates can take about a minute.');
    } catch (_) {
      _message('Could not save the rental. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(RentalItem item) async {
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Delete rental?'),
                content: Text(
                    'Delete "${item.title}"? You can also hide it using the visibility switch.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  ElevatedButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Delete'))
                ]));
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await _repository.deleteItem(item.id);
      if (_editingId == item.id && mounted) _edit(null);
      _message('Rental deleted.');
    } catch (_) {
      _message('Could not delete the rental. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(TextEditingController controller, String label,
          {String? Function(String?)? validator,
          int lines = 1,
          int? maxLength,
          bool number = false}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: TextFormField(
              controller: controller,
              maxLines: lines,
              maxLength: maxLength,
              keyboardType: number
                  ? const TextInputType.numberWithOptions(decimal: true)
                  : null,
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder()),
              validator: validator));

  Widget _editor() => Card(
      color: Colors.black.withValues(alpha: .45),
      child: Padding(
          padding: const EdgeInsets.all(18),
          child: Form(
              key: _form,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(_editingId == null ? 'Add rental' : 'Edit rental',
                        style: const TextStyle(
                            fontSize: 24, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    _field(_title, 'Item name',
                        maxLength: 160,
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'Enter an item name.'
                            : null),
                    _field(_description, 'Description',
                        lines: 3, maxLength: 2000),
                    _field(_category, 'Category',
                        maxLength: 60,
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'Enter a category.'
                            : null),
                    _field(_quantity, 'Quantity owned', number: true,
                        validator: (v) {
                      final n = int.tryParse((v ?? '').trim());
                      return n == null || n < 1 || n > 10000
                          ? 'Enter a quantity from 1 to 10,000.'
                          : null;
                    }),
                    _field(_sort, 'Sort order',
                        number: true,
                        validator: (v) => int.tryParse((v ?? '').trim()) == null
                            ? 'Enter a whole number.'
                            : null),
                    _field(_productUrl, 'Manufacturer / product URL (optional)',
                        maxLength: 2048, validator: _urlValidator),
                    _field(_imageUrl, 'Photo URL (optional)',
                        maxLength: 2048, validator: _urlValidator),
                    if (_imageBytes != null)
                      Image.memory(_imageBytes!,
                          height: 180, fit: BoxFit.contain)
                    else if (_imageUrl.text.trim().isNotEmpty)
                      Image.network(_imageUrl.text.trim(),
                          height: 180,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) =>
                              const Text('Photo could not be loaded.')),
                    Wrap(spacing: 10, children: [
                      OutlinedButton.icon(
                          onPressed: _pickImage,
                          icon: const Icon(Icons.photo),
                          label: const Text('Upload photo')),
                      TextButton(
                          onPressed: () => setState(() {
                                _imageBytes = null;
                                _imageDataUrl = null;
                                _imageUrl.clear();
                                _imageStoragePath = '';
                              }),
                          child: const Text('Remove photo'))
                    ]),
                    const SizedBox(height: 18),
                    DropdownButtonFormField<String>(
                        initialValue: _priceMode,
                        key: ValueKey('$_editingId-$_priceMode'),
                        decoration: const InputDecoration(
                            labelText: 'Pricing', border: OutlineInputBorder()),
                        items: const [
                          DropdownMenuItem(
                              value: 'quote', child: Text('Contact For Quote')),
                          DropdownMenuItem(
                              value: 'price', child: Text('Enter a price'))
                        ],
                        onChanged: (value) =>
                            setState(() => _priceMode = value ?? 'quote')),
                    const SizedBox(height: 14),
                    if (_priceMode == 'price') ...[
                      _field(_price, 'Price (USD)',
                          number: true,
                          validator: (v) => rentalPriceCents(v ?? '') == null
                              ? 'Enter a non-negative price with up to 2 decimal places.'
                              : null),
                      _field(_priceUnit,
                          'Price unit (optional, e.g. per day or per setup)',
                          maxLength: 80),
                    ],
                    SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Visible on the website'),
                        value: _isActive,
                        onChanged: (v) => setState(() => _isActive = v)),
                    const SizedBox(height: 14),
                    Wrap(spacing: 10, runSpacing: 10, children: [
                      ElevatedButton.icon(
                          onPressed: _save,
                          icon: const Icon(Icons.save),
                          label: const Text('Save rental')),
                      OutlinedButton(
                          onPressed: () => _edit(null),
                          child: const Text('New rental'))
                    ]),
                  ]))));

  Widget _list() => StreamBuilder<List<RentalItem>>(
      stream: _items,
      builder: (context, snapshot) {
        if (snapshot.hasError)
          return const Card(
              child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text(
                      'Could not load rentals. Please reopen the editor.')));
        if (!snapshot.hasData)
          return const Center(child: CircularProgressIndicator());
        final items = snapshot.data!;
        return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                  padding: EdgeInsets.all(12),
                  child: Text('Rental inventory',
                      style: TextStyle(
                          fontSize: 24, fontWeight: FontWeight.bold))),
              if (items.isEmpty)
                const Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('No rental items yet. Add your first item.')),
              for (final item in items)
                Card(
                    color: Colors.black.withValues(alpha: .45),
                    child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.title,
                                  style: const TextStyle(
                                      fontSize: 19,
                                      fontWeight: FontWeight.bold)),
                              const SizedBox(height: 6),
                              Text(
                                  '${item.category} · ${item.quantity} owned · ${item.isActive ? 'Visible' : 'Hidden'} · Sort: ${item.sortOrder}'),
                              const SizedBox(height: 6),
                              Text(item.priceLabel),
                              const SizedBox(height: 10),
                              Wrap(spacing: 10, children: [
                                ElevatedButton(
                                    onPressed: () => _edit(item),
                                    child: const Text('Edit')),
                                OutlinedButton(
                                    onPressed: () => _delete(item),
                                    child: const Text('Delete'))
                              ]),
                            ]))),
            ]);
      });

  @override
  Widget build(BuildContext context) => FutureBuilder<void>(
      future: _initialization,
      builder: (context, snapshot) {
        if (snapshot.hasError)
          return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Could not initialize rental inventory.'),
            TextButton(
                onPressed: () => setState(
                    () => _initialization = _repository.seedInitialInventory()),
                child: const Text('Retry'))
          ]));
        if (snapshot.connectionState != ConnectionState.done)
          return const Center(child: CircularProgressIndicator());
        return Stack(children: [
          AbsorbPointer(
              absorbing: _busy,
              child: Center(
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 1200),
                      child: LayoutBuilder(
                          builder: (context, constraints) => ListView(
                                  controller: _scroll,
                                  padding: const EdgeInsets.all(16),
                                  children: [
                                    if (constraints.maxWidth >= 1000)
                                      Row(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Expanded(child: _editor()),
                                            const SizedBox(width: 16),
                                            Expanded(child: _list())
                                          ])
                                    else ...[
                                      _editor(),
                                      const SizedBox(height: 16),
                                      _list()
                                    ],
                                  ]))))),
          if (_busy) const Center(child: CircularProgressIndicator())
        ]);
      });
}
