import 'package:cloud_firestore/cloud_firestore.dart';

/// Server enrollment selects a separate data namespace. No email heuristics or
/// client switch grant demo access; errors propagate instead of using live data.
class AppReviewAccess {
  AppReviewAccess(this.firestore);
  final FirebaseFirestore firestore;

  Future<CollectionReference<Map<String, dynamic>>> collection(
      String name, String uid) async {
    final registry = firestore.collection('appReviewAccounts').doc(uid);
    final enrollment = await registry.get();
    return enrollment.exists
        ? registry.collection(name)
        : firestore.collection(name);
  }

  Stream<DocumentSnapshot<Map<String, dynamic>>> profile(String uid) async* {
    final profiles = await collection('userProfiles', uid);
    yield* profiles.doc(uid).snapshots();
  }
}
