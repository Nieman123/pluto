import 'package:firebase_storage/firebase_storage.dart';

class PublicMediaUpload {
  const PublicMediaUpload({
    required this.downloadUrl,
    required this.storagePath,
  });

  final String downloadUrl;
  final String storagePath;
}

class PublicMediaRepository {
  PublicMediaRepository({FirebaseStorage? storage})
      : _storage = storage ?? FirebaseStorage.instance;

  static const int maxImageBytes = 5 * 1024 * 1024;
  final FirebaseStorage _storage;

  Future<PublicMediaUpload> uploadEventFlyer({
    required String eventId,
    required String dataUrl,
  }) {
    return _uploadDataUrl(
      directory: 'public/events/$eventId',
      dataUrl: dataUrl,
    );
  }

  Future<PublicMediaUpload> uploadLinkImage({
    required String linkId,
    required String dataUrl,
  }) {
    return _uploadDataUrl(
      directory: 'public/links/$linkId',
      dataUrl: dataUrl,
    );
  }

  Future<PublicMediaUpload> _uploadDataUrl({
    required String directory,
    required String dataUrl,
  }) async {
    final RegExpMatch? match =
        RegExp(r'^data:(image/[^;]+);base64,').firstMatch(dataUrl.trim());
    if (match == null) {
      throw const FormatException(
          'Only base64 image data URLs can be uploaded.');
    }

    final String contentType = match.group(1)!;
    final String extension = _extensionForMimeType(contentType);
    final String storagePath =
        '$directory/${DateTime.now().millisecondsSinceEpoch}.$extension';
    final Reference reference = _storage.ref(storagePath);
    await reference.putString(
      dataUrl,
      format: PutStringFormat.dataUrl,
      metadata: SettableMetadata(contentType: contentType),
    );
    return PublicMediaUpload(
      downloadUrl: await reference.getDownloadURL(),
      storagePath: storagePath,
    );
  }

  static String _extensionForMimeType(String mimeType) {
    switch (mimeType.toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/gif':
        return 'gif';
      case 'image/jpeg':
      case 'image/jpg':
      default:
        return 'jpg';
    }
  }
}
