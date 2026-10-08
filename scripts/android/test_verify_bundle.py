import struct
import unittest
from verify_bundle import check_elf


def elf(alignment=16384, file_offset=0, virtual_address=0):
    data = bytearray(120)
    data[:6] = b'\x7fELF\x02\x01'
    struct.pack_into('<Q', data, 32, 64)
    struct.pack_into('<HH', data, 54, 56, 1)
    struct.pack_into('<IIQQQQQQ', data, 64, 1, 5, file_offset, virtual_address, 0, 1, 1, alignment)
    return data


class NativeLibraryAlignment(unittest.TestCase):
    def test_page_aligned_segments(self):
        check_elf(elf(), 'arm64/libapp.so')
        check_elf(elf(65536, 16384, 32768), 'arm64/libflutter.so')

    def test_small_pages_or_incongruent_offsets_are_rejected(self):
        for data in (elf(4096), elf(16384, 4096, 0)):
            with self.assertRaises(ValueError):
                check_elf(data, 'arm64/third-party.so')

    def test_malformed_or_missing_load_table_is_rejected(self):
        for data in (b'invalid', elf()[:70], bytearray(64)):
            with self.assertRaises(ValueError):
                check_elf(data, 'arm64/invalid.so')


if __name__ == '__main__':
    unittest.main()
