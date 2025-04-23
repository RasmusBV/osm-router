import * as Format from "./format.js"

export async function generateTableEntry(section: Format.SerializedSection): Promise<Format.SectionTableEntry> {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("sha-1", section.buffer))
    return {
        size: section.buffer.byteLength,
        digest,
        name: section.name,
        flags: section.flags
    }
}

export function serialize(entries: Format.SectionTableEntry[], buffer: DataView<ArrayBuffer>, header: Omit<Format.Header, "digest">) {
    const littleEndian = !header.flags.bigEndian
    for(let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const offset = Format.SECTION_TABLE_ENTRY_SIZE * i
        const id = Format.REVERSE_SECTION_TYPE_MAP.get(entry.name)
        if(id === undefined) {
            throw new Error(`Unknown section name ${entry.name}.`)
        }
        const flags = Format.encodeBitFlags(entry.name, entry.flags)
        buffer.setBigUint64(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.SIZE, BigInt(entry.size), littleEndian)
        buffer.setUint16(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.ID, id, littleEndian)
        buffer.setUint8(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.FLAGS, flags)
        for(let i = 0; i < Format.DIGEST_SIZE; i++) {
            buffer.setUint8(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.DIGEST + i, entry.digest[i])
        }
    }
    return buffer
}

export function deserialize(buffer: DataView<ArrayBuffer>, header: Format.Header) {
    const littleEndian = !header.flags.bigEndian
    const entries: (Format.SectionTableEntry | Format.UnknownSectionTableEntry)[] = []

    let offset = 0
    while(offset < header.sectionTableSize) {
        const size = Number(buffer.getBigUint64(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.SIZE, littleEndian))
        const id = buffer.getUint16(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.ID, littleEndian)
        const digest = new Uint8Array(buffer.buffer.slice(
            buffer.byteOffset + Format.SECTION_TABLE_ENTRY_OFFSETS.DIGEST, 
            buffer.byteOffset + Format.SECTION_TABLE_ENTRY_OFFSETS.DIGEST + Format.DIGEST_SIZE
        ))
        const name = Format.SECTION_TYPE_MAP.get(id)
        if(!name) {
            entries.push({size, digest, id})
        } else {
            const flags = Format.decodeBitFlags(name, offset + Format.SECTION_TABLE_ENTRY_OFFSETS.FLAGS)
            entries.push({
                name,
                size,
                digest,
                flags
            })
        }
        offset += Format.SECTION_TABLE_ENTRY_SIZE
    }
    return entries
}