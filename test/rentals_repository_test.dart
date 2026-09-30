import 'package:flutter_test/flutter_test.dart';
import 'package:pluto/rentals_repository.dart';

void main() {
  test('rental prices convert to cents without floating point rounding', () {
    expect(rentalPriceCents('25.50'), 2550);
    expect(rentalPriceCents('12.3'), 1230);
    expect(rentalPriceCents('0'), 0);
    expect(rentalPriceCents(' 9.99 '), 999);
    for (final value in ['-1', 'NaN', '1.999', '1e3', '', '1000000', '1,000']) {
      expect(rentalPriceCents(value), isNull);
    }
  });
  test('quote pricing and entered rates have distinct display values', () {
    expect(
        const RentalItem(id: 'quote', data: {'priceMode': 'quote'}).priceLabel,
        'Contact For Quote');
    expect(
        const RentalItem(id: 'priced', data: {
          'priceMode': 'price',
          'priceCents': 2500,
          'priceUnit': 'per day'
        }).priceLabel,
        r'$25.00 per day');
  });
}
