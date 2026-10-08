"""Validate load-segment alignment of every 64-bit native library in an AAB.

This is one build gate, not a replacement for a Play pre-launch test on a
16 KB device or for checking the alignment of the generated installation APK.
"""
import struct
import sys
import zipfile


def check_elf(data, name):
    if data[:6] != b'\x7fELF\x02\x01' or len(data) < 64:
        raise ValueError(f'{name}: expected a 64-bit little-endian ELF library')
    offset = struct.unpack_from('<Q', data, 32)[0]
    size, count = struct.unpack_from('<HH', data, 54)
    if size < 56 or count == 0 or offset + size * count > len(data):
        raise ValueError(f'{name}: invalid ELF program header table')
    found = False
    for index in range(count):
        segment = struct.unpack_from('<IIQQQQQQ', data, offset + index * size)
        if segment[0] != 1:  # PT_LOAD
            continue
        found = True
        if segment[7] < 16384 or segment[2] % 16384 != segment[3] % 16384:
            raise ValueError(f'{name}: load segment is incompatible with 16 KB pages')
    if not found:
        raise ValueError(f'{name}: no load segments')


def main(path):
    checked = []
    with zipfile.ZipFile(path) as bundle:
        for item in bundle.infolist():
            if '/lib/' in item.filename and any(f'/{abi}/' in item.filename
                    for abi in ('arm64-v8a', 'x86_64')) and item.filename.endswith('.so'):
                check_elf(bundle.read(item), item.filename)
                checked.append(item.filename)
    if not any('/arm64-v8a/libflutter.so' in name for name in checked):
        raise ValueError('The bundle is missing its ARM64 Flutter engine')
    print(f'16 KB ELF alignment passed for {len(checked)} native libraries.')


if __name__ == '__main__':
    try:
        main(sys.argv[1])
    except (IndexError, ValueError, zipfile.BadZipFile) as error:
        sys.exit(str(error))
