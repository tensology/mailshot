import { Buffer } from 'buffer';

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const sanitizeZipName = (name = 'attachment') => String(name || 'attachment')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop()
    .replace(/[^\w .()[\]-]/g, '_') || 'attachment';

const uint16 = (value) => {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value);
    return buffer;
};

const uint32 = (value) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value >>> 0);
    return buffer;
};

export const createZipArchive = (files = []) => {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file, index) => {
        const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '');
        const filename = Buffer.from(`${index + 1}-${sanitizeZipName(file.filename)}`);
        const checksum = crc32(data);
        const localHeader = Buffer.concat([
            uint32(0x04034b50),
            uint16(20),
            uint16(0),
            uint16(0),
            uint16(0),
            uint16(0),
            uint32(checksum),
            uint32(data.length),
            uint32(data.length),
            uint16(filename.length),
            uint16(0),
            filename
        ]);

        localParts.push(localHeader, data);
        centralParts.push(Buffer.concat([
            uint32(0x02014b50),
            uint16(20),
            uint16(20),
            uint16(0),
            uint16(0),
            uint16(0),
            uint16(0),
            uint32(checksum),
            uint32(data.length),
            uint32(data.length),
            uint16(filename.length),
            uint16(0),
            uint16(0),
            uint16(0),
            uint16(0),
            uint32(0),
            uint32(offset),
            filename
        ]));
        offset += localHeader.length + data.length;
    });

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.concat([
        uint32(0x06054b50),
        uint16(0),
        uint16(0),
        uint16(files.length),
        uint16(files.length),
        uint32(centralDirectory.length),
        uint32(offset),
        uint16(0)
    ]);

    return Buffer.concat([...localParts, centralDirectory, end]);
};
