// Minimal, dependency-free width/height sniffing for PNG and JPEG buffers.
// (Deliberately not using the `image-size` npm package - it has an unpatched
// high-severity DoS advisory in its ICNS/JXL/HEIF parsers; we only ever need
// PNG/JPEG here, so a tiny hand-rolled reader avoids pulling in that risk.)

function pngDims(buf){
  if(buf.length < 24) return null;
  const isPng = buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
  if(!isPng) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDims(buf){
  if(buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let offset = 2;
  while(offset + 9 < buf.length){
    if(buf[offset] !== 0xFF) { offset++; continue; }
    const marker = buf[offset + 1];
    const isSOF = (marker >= 0xC0 && marker <= 0xCF) && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
    const segLen = buf.readUInt16BE(offset + 2);
    if(isSOF){
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    if(marker === 0xD8 || marker === 0xD9) { offset += 2; continue; }
    offset += 2 + segLen;
  }
  return null;
}

// Returns {width, height} in pixels, or null if the format isn't recognized.
function getImageDimensions(buf){
  return pngDims(buf) || jpegDims(buf);
}

module.exports = { getImageDimensions };
