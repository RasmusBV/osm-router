import * as Format from "./format.js"

export function serialize(header: Omit<Format.Header, "digest">, buffer: DataView<ArrayBuffer>) {
    const littleEndian = !header.flags.bigEndian
    for(let i = 0; i < Format.FILE_SIGNATURE.length; i++) {
        buffer.setUint8(Format.HEADER_OFFSETS.SIGNATURE + i, Format.FILE_SIGNATURE[i])
    }
    const timestamp = BigInt(Date.now())
    const flags = Format.encodeBitFlags("header", header.flags)
    buffer.setUint8(Format.HEADER_OFFSETS.MAJOR_VERSION, Format.MAJOR_VERSION)
    buffer.setUint8(Format.HEADER_OFFSETS.MINOR_VERSION, Format.MINOR_VERSION)
    buffer.setUint8(Format.HEADER_OFFSETS.FLAGS, flags)
    buffer.setBigUint64(Format.HEADER_OFFSETS.GRAPH_ID, header.id, littleEndian)
    buffer.setBigInt64(Format.HEADER_OFFSETS.TIMESTAMP, timestamp, littleEndian)
    buffer.setUint32(Format.HEADER_OFFSETS.SECTION_TABLE_SIZE, header.sectionTableSize, littleEndian)
    return buffer
}

export async function writeDigest(headerAndSectionTable: DataView<ArrayBuffer>) {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("sha-1", headerAndSectionTable))
    for(let i = 0; i < digest.length; i++) {
        headerAndSectionTable.setUint8(Format.HEADER_OFFSETS.DIGEST + i, digest[i])
    }
    return digest
}

function cloneDigest(header: DataView<ArrayBuffer>) {
    const digestOffset = header.byteOffset + Format.HEADER_OFFSETS.DIGEST
    return new Uint8Array(header.buffer.slice(digestOffset, digestOffset + Format.DIGEST_SIZE))
}

export async function checkDigest(headerAndSectionTable: DataView<ArrayBuffer>) {
    const existingDigest = cloneDigest(headerAndSectionTable)
    for(let i = 0; i < Format.DIGEST_SIZE; i++) {
        headerAndSectionTable.setUint8(Format.HEADER_OFFSETS.DIGEST + i, 0)
    }
    await writeDigest(headerAndSectionTable)
    const computedDigest = new Uint8Array(await globalThis.crypto.subtle.digest("sha-1", headerAndSectionTable))
    for(let i = 0; i < Format.DIGEST_SIZE; i++) {
        headerAndSectionTable.setUint8(Format.HEADER_OFFSETS.DIGEST + i, existingDigest[i])
    }
    for(let i = 0; i < Format.DIGEST_SIZE; i++) {
        if(existingDigest[i] !== computedDigest[i]) { return false }
    }
    return true
}

export function deserialize(buffer: DataView<ArrayBuffer>): Format.Header {
    const correctFileSignature = Format.FILE_SIGNATURE.every((val, i) => {
        return buffer.getUint8(Format.HEADER_OFFSETS.SIGNATURE + i) === val
    })
    if(!correctFileSignature) {
        throw new Error("Incorrect file signature")
    }
    const majorVersion = buffer.getUint8(Format.HEADER_OFFSETS.MAJOR_VERSION)
    const minorVersion = buffer.getUint8(Format.HEADER_OFFSETS.MINOR_VERSION)
    
    if(majorVersion > Format.MAJOR_VERSION) {
        throw new Error(`Unsupported file version ${majorVersion}.${minorVersion}, parser only supports up to major version ${majorVersion}`)
    }
    if(minorVersion > Format.MINOR_VERSION) {
        console.warn(`File uses newer minor version ${majorVersion}.${minorVersion}. Some features may not be supported.`)
    }
    const flags = Format.decodeBitFlags("header", buffer.getUint8(Format.HEADER_OFFSETS.FLAGS))
    const littleEndian = !flags.bigEndian

    const id = buffer.getBigUint64(Format.HEADER_OFFSETS.GRAPH_ID, littleEndian)
    const timestamp = Number(buffer.getBigInt64(Format.HEADER_OFFSETS.TIMESTAMP, littleEndian))
    const sectionTableSize = buffer.getUint32(Format.HEADER_OFFSETS.SECTION_TABLE_SIZE, littleEndian)
    const digest = new Uint8Array(buffer.buffer, buffer.byteOffset + Format.HEADER_OFFSETS.DIGEST, Format.DIGEST_SIZE)
    return {
        majorVersion,
        minorVersion,
        flags,
        id,
        timestamp,
        sectionTableSize,
        digest
    }
}