// Fabrique un Shapefile de points minimal dans un ZIP non compressé, pour tester l'import sans fichier binaire au dépôt.
import { Buffer } from 'node:buffer';
import { crc32 } from 'node:zlib';

function shp(points) {
  const recLen = 8 + 20;
  const size = 100 + points.length * recLen;
  const b = Buffer.alloc(size);
  b.writeInt32BE(9994, 0);
  b.writeInt32BE(size / 2, 24);
  b.writeInt32LE(1000, 28);
  b.writeInt32LE(1, 32);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  b.writeDoubleLE(Math.min(...xs), 36); b.writeDoubleLE(Math.min(...ys), 44); b.writeDoubleLE(Math.max(...xs), 52); b.writeDoubleLE(Math.max(...ys), 60);
  points.forEach((p, i) => {
    const o = 100 + i * recLen;
    b.writeInt32BE(i + 1, o); b.writeInt32BE(10, o + 4); b.writeInt32LE(1, o + 8); b.writeDoubleLE(p[0], o + 12); b.writeDoubleLE(p[1], o + 20);
  });
  return b;
}
function dbf(names) {
  const fieldLen = 12, headerLen = 32 + 32 + 1, recLen = 1 + fieldLen;
  const b = Buffer.alloc(headerLen + names.length * recLen + 1, 0x20);
  b.writeUInt8(3, 0); b.writeUInt8(126, 1); b.writeUInt8(1, 2); b.writeUInt8(1, 3);
  b.writeUInt32LE(names.length, 4); b.writeUInt16LE(headerLen, 8); b.writeUInt16LE(recLen, 10);
  b.fill(0, 12, 32);
  b.fill(0, 32, 64); b.write('NOM', 32, 'ascii'); b.write('C', 43, 'ascii'); b.writeUInt8(fieldLen, 48);
  b.writeUInt8(0x0d, 64);
  names.forEach((n, i) => { const o = headerLen + i * recLen; b.write(' ', o, 'ascii'); b.write(n.padEnd(fieldLen), o + 1, 'ascii'); });
  b.writeUInt8(0x1a, b.length - 1);
  return b;
}
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const n = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
export function makeShapefileZip() {
  return zip([['points.shp', shp([[-7.6, 33.5], [-6.85, 34.02]])], ['points.dbf', dbf(['Casa', 'Rabat'])]]);
}
