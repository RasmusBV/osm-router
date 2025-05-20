import * as fs from "fs/promises"

export class Format<
    F extends FormatDefinition,
    S extends SectionDefinition[]
> {
    sectionNameMap: SectionNameMap<S>
    sectionIdMap: Map<number, S[number]>
    constructor(
        public format: F,
        public sections: S
    ) {
        this.sectionNameMap = Object.fromEntries(sections.map((section) => [section.name, section])) as SectionNameMap<S>
        this.sectionIdMap = new Map(sections.map((section) => [section.id, section]))
    }

    async serialize(
        id: bigint,
        flags: Record<LatestVersionFlags<F>, boolean>,
        sections: SerializedSection<S, SectionNames<S>>[]
    ) {
        const version = this.format.versions.length - 1
        const format = this.format.versions[version]
        const sectionBuffers = this.alignSections(sections, format.alignment)
        const sectionTableSize = sections.length * Format.SECTION_TABLE_ENTRY_SIZE
        const headerAndSectionTableBuffer = new ArrayBuffer(sectionTableSize + Format.HEADER_SIZE)
        await this.serializeSectionTable(sections, new DataView(headerAndSectionTableBuffer, Format.HEADER_SIZE, sectionTableSize))
        this.serializeHeader(id, version, flags, sectionTableSize, new DataView(headerAndSectionTableBuffer, 0, Format.HEADER_SIZE))
        await Format.writeHeaderDigest(new DataView(headerAndSectionTableBuffer))
        const out = [new DataView(headerAndSectionTableBuffer), ...sectionBuffers]
        return out
    }

    async serializeVersion() {}

    async deserialize(path: string): Promise<Deserialized<F, S>> {
        const handle = await fs.open(path, "r")
        const { buffer: headerBuffer } = await handle.read(new DataView(new ArrayBuffer(Format.HEADER_SIZE)), 0, Format.HEADER_SIZE)
        const header = this.deserializeHeader(headerBuffer)
        
        const { buffer: sectionTableBuffer } = await handle.read(new DataView(new ArrayBuffer(header.sectionTableSize)), 0, header.sectionTableSize)
        const sectionTable = this.deserializeSectionTable(sectionTableBuffer)
        const format = this.format.versions[header.version]
        const sectionBuffers = await this.readAlignedSections(sectionTable, handle, format.alignment)
        const sections: SerializedSection<S, SectionNames<S>>[] = sectionTable.map((entry, i) => {
            if(!("name" in entry)) { return undefined }
            const buffer = sectionBuffers[i]
            return {
                buffer,
                name: entry.name,
                flags: entry.flags
            }
        }).filter((section) => section !== undefined)
        await handle.close()
        return new Deserialized(header, sectionTable, sections)
    }

    serializeBitFlags<T extends string[]>(definition: T, flags: Record<T[number], boolean>) {
        let encoded = 0
        for(let i = 0; i < definition.length; i++) {
            const flagValue = flags[definition[i] as T[number]]
            if(!flagValue) { continue }
            encoded = encoded | ( 1<<i )
        }
        return encoded
    }
    
    deserializeBitFlags<T extends string[]>(definition: T, encoded: number) {
        return Object.fromEntries(definition.map((name, i) => [name, ( encoded & (1<<i)) !== 0])) as Record<T[number], boolean>
    }

    alignSections(sections: SerializedSection<S, SectionNames<S>>[], alignment: number) {
        const sectionBuffers: DataView<ArrayBuffer>[] = []
        for(const section of sections) {
            const inversePadding = section.buffer.byteLength % alignment
            sectionBuffers.push(section.buffer)
            if(inversePadding !== 0) {
                const alignmentBuffer = new DataView(new ArrayBuffer(alignment - inversePadding))
                sectionBuffers.push(alignmentBuffer)
            }
        }
        return sectionBuffers
    }

    async readAlignedSections(
        sectionTable: (SectionTableEntry<S, SectionNames<S>> | UnknownSectionTableEntry)[], 
        handle: fs.FileHandle,
        alignment: number
    ) {
        let totalSize = 0
        const sectionBuffers: DataView<ArrayBuffer>[] = []
        const alignmentBufferIndecies: number[] = []
        for(const entry of sectionTable) {
            const inversePadding = entry.size % alignment
            sectionBuffers.push(new DataView(new ArrayBuffer(entry.size)))
            totalSize += entry.size
            if(inversePadding !== 0) {
                const alignmentSize = alignment - inversePadding
                totalSize += alignmentSize
                const alignmentBuffer = new DataView(new ArrayBuffer(alignmentSize))
                alignmentBufferIndecies.push(sectionBuffers.length)
                sectionBuffers.push(alignmentBuffer)
            }
        }
        const {bytesRead} = await handle.readv(sectionBuffers)
        if(totalSize !== bytesRead) {
            throw new Error(`Truncated data sections, expected ${totalSize} bytes, got only ${bytesRead}`)
        }
        return sectionBuffers.filter((_, i) => !alignmentBufferIndecies.includes(i))
    }

    async serializeSectionTable(
        sections: SerializedSection<S, SectionNames<S>>[], 
        buffer: DataView<ArrayBuffer>
    ) {
        for(let i = 0; i < sections.length; i++) {
            const offset = Format.SECTION_TABLE_ENTRY_SIZE * i
            const section = sections[i]
            const definition = this.sectionNameMap[section.name]
            if(!definition) {
                throw new Error(`Unknown section ${section.name}.`)
            }
            const digestArrayBuffer = await globalThis.crypto.subtle.digest("sha-1", section.buffer)
            const digest = new Uint8Array(digestArrayBuffer)
            const size = section.buffer.byteLength
            const flags = this.serializeBitFlags(definition.flags ?? [], section.flags)
            buffer.setBigUint64(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.SIZE, BigInt(size))
            buffer.setUint16(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.ID, definition.id)
            buffer.setUint8(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.FLAGS, flags)
            for(let i = 0; i < Format.DIGEST_SIZE; i++) {
                buffer.setUint8(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.DIGEST + i, digest[i])
            }
        }
        return buffer
    }

    deserializeSectionTable(
        buffer: DataView<ArrayBuffer>
    ) {
        const entries: (SectionTableEntry<S, SectionNames<S>> | UnknownSectionTableEntry)[] = []
        let offset = 0
        while(offset < buffer.byteLength) {
            const size = Number(buffer.getBigUint64(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.SIZE))
            const id = buffer.getUint16(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.ID)
            const digest = new Uint8Array(buffer.buffer.slice(
                buffer.byteOffset + Format.SECTION_TABLE_ENTRY_OFFSETS.DIGEST, 
                buffer.byteOffset + Format.SECTION_TABLE_ENTRY_OFFSETS.DIGEST + Format.DIGEST_SIZE
            ))
            const definition = this.sectionIdMap.get(id)
            if(!definition) {
                entries.push({size, digest, id})
            } else {
                const flags = this.deserializeBitFlags(
                    definition.flags ?? [], 
                    buffer.getUint8(offset + Format.SECTION_TABLE_ENTRY_OFFSETS.FLAGS)
                ) as Flags<SectionNames<S>, S>
                entries.push({
                    name: definition.name,
                    size,
                    digest,
                    flags
                })
            }
            offset += Format.SECTION_TABLE_ENTRY_SIZE
        }
        return entries
    }

    serializeHeader(
        id: bigint,
        versionNumber: number,
        flags: Record<string, boolean>,
        sectionTableSize: number,
        buffer: DataView<ArrayBuffer>
    ) {
        for(let i = 0; i < this.format.signature.length; i++) {
            buffer.setUint8(Format.HEADER_OFFSETS.SIGNATURE + i, this.format.signature[i])
        }
        const version = this.format.versions[versionNumber]
        for(const flag of version.flags) {
            if(!(flag in flags)) {
                throw new Error(`Incorrect flags got [${Object.keys(flags).join(",")}],\n expected [${version.flags.join(",")}].`)
            }
        }
        const timestamp = BigInt(Date.now())
        const encodedFlags = this.serializeBitFlags(version.flags, flags)
        buffer.setUint8(Format.HEADER_OFFSETS.FORMAT_VERSION, Format.FORMAT_VERSION)
        buffer.setUint8(Format.HEADER_OFFSETS.DATA_VERSION, versionNumber)
        buffer.setUint8(Format.HEADER_OFFSETS.FLAGS, encodedFlags)
        buffer.setBigUint64(Format.HEADER_OFFSETS.ID, id)
        buffer.setBigInt64(Format.HEADER_OFFSETS.TIMESTAMP, timestamp)
        buffer.setUint32(Format.HEADER_OFFSETS.SECTION_TABLE_SIZE, sectionTableSize)
        return buffer
    }

    deserializeHeader(buffer: DataView<ArrayBuffer>) {
        const correctFileSignature = this.format.signature.every((val, i) => {
            return buffer.getUint8(Format.HEADER_OFFSETS.SIGNATURE + i) === val
        })
        if(!correctFileSignature) {
            throw new Error("Incorrect file signature")
        }
        const dataVersion = buffer.getUint8(Format.HEADER_OFFSETS.DATA_VERSION)
        const formatVersion = buffer.getUint8(Format.HEADER_OFFSETS.FORMAT_VERSION)
        if(formatVersion !== Format.FORMAT_VERSION) {
            throw new Error(`Unsupported format version ${formatVersion}, this deserializer only supports up to version ${formatVersion}`)
        }
        if(dataVersion > this.format.versions.length-1) {
            throw new Error(`Unsupported data version ${dataVersion}, this deserializer only supports up to version ${dataVersion}`)
        }
        const version = this.format.versions[dataVersion]
        const flags = this.deserializeBitFlags(
            version.flags, 
            buffer.getUint8(Format.HEADER_OFFSETS.FLAGS)
        )
    
        const id = buffer.getBigUint64(Format.HEADER_OFFSETS.ID)
        const timestamp = Number(buffer.getBigInt64(Format.HEADER_OFFSETS.TIMESTAMP))
        const sectionTableSize = buffer.getUint32(Format.HEADER_OFFSETS.SECTION_TABLE_SIZE)
        const digest = new Uint8Array(buffer.buffer, buffer.byteOffset + Format.HEADER_OFFSETS.DIGEST, Format.DIGEST_SIZE)
        return {
            version: dataVersion,
            flags,
            id,
            timestamp,
            sectionTableSize,
            digest
        } as Header<F>
    }

    static async writeHeaderDigest(headerAndSectionTable: DataView<ArrayBuffer>) {
    
        const digest = new Uint8Array(await globalThis.crypto.subtle.digest("sha-1", headerAndSectionTable))
        for(let i = 0; i < digest.length; i++) {
            headerAndSectionTable.setUint8(this.HEADER_OFFSETS.DIGEST + i, digest[i])
        }
        return digest
    }
    
    static cloneHeaderDigest(header: DataView<ArrayBuffer>) {
        const digestOffset = header.byteOffset + this.HEADER_OFFSETS.DIGEST
        return new Uint8Array(header.buffer.slice(digestOffset, digestOffset + this.DIGEST_SIZE))
    }
    
    static async checkHeaderDigest(headerAndSectionTable: DataView<ArrayBuffer>) {
        const existingDigest = this.cloneHeaderDigest(headerAndSectionTable)
        for(let i = 0; i < this.DIGEST_SIZE; i++) {
            headerAndSectionTable.setUint8(this.HEADER_OFFSETS.DIGEST + i, 0)
        }
        await this.writeHeaderDigest(headerAndSectionTable)
        const computedDigest = new Uint8Array(await globalThis.crypto.subtle.digest("sha-1", headerAndSectionTable))
        for(let i = 0; i < this.DIGEST_SIZE; i++) {
            headerAndSectionTable.setUint8(this.HEADER_OFFSETS.DIGEST + i, existingDigest[i])
        }
        for(let i = 0; i < this.DIGEST_SIZE; i++) {
            if(existingDigest[i] !== computedDigest[i]) { return false }
        }
        return true
    }
    
    static HEADER_OFFSETS = {
        SIGNATURE: 0x00,
        FORMAT_VERSION: 0x04,
        DATA_VERSION: 0x05,
        FLAGS: 0x07,
        ID: 0x08,
        TIMESTAMP: 0x10,
        DIGEST: 0x18,
        SECTION_TABLE_SIZE: 0x2c
    } as const

    static HEADER_SIZE = 48

    static SECTION_TABLE_ENTRY_OFFSETS = {
        SIZE: 0x00,
        ID: 0x08,
        FLAGS: 0x0a,
        DIGEST: 0x0c
    } as const

    static SECTION_TABLE_ENTRY_SIZE = 32

    static DIGEST_SIZE = 20

    static FORMAT_VERSION = 1
}

export type SectionDefinition = {
    name: string
    id: number
    flags?: string[]
}

export type SectionNameMap<S extends SectionDefinition[]> = {
    [K in S[number]["name"]]: Extract<S[number], {name: K}>
}

export type SectionNames<S extends SectionDefinition[]> = S[number]["name"]

type FlagArray<T extends string, R extends SectionDefinition[]> = Extract<R[number], {name: T}>["flags"]

type Flags<T extends string, R extends SectionDefinition[]> = FlagArray<T, R> extends string[] ? {
    [K in FlagArray<T, R>[number]]: boolean
} : {}

export class Deserialized<
    F extends FormatDefinition,
    S extends SectionDefinition[]
> {
    constructor(
        public header: Header<F>,
        public sectionTable: (SectionTableEntry<S, SectionNames<S>> | UnknownSectionTableEntry)[],
        public sections: SerializedSection<S, SectionNames<S>>[]
    ) {}

    getSections<T extends SectionNames<S>>(name: T) {
        return this.sections.filter((section): section is SerializedSection<S, T> => section.name === name)
    }
    getSection<T extends SectionNames<S>>(name: T) {
        const sections = this.getSections(name)
        if(sections.length !== 1) {
            throw new Error(`Cannot get singular section with name "${name}"`)
        }
        return sections[0]
    }
}

export type SerializedSection<
    S extends SectionDefinition[], 
    T extends SectionNames<S>
> = {
    buffer: DataView<ArrayBuffer>
    name: T,
    flags: Flags<T, S>
}


export type SectionTableEntry<
    S extends SectionDefinition[], 
    T extends SectionNames<S>
> = {
    size: number
    digest: Uint8Array<ArrayBuffer>
    name: T
    flags: Flags<T, S>
}

export type UnknownSectionTableEntry = {
    id: number
    size: number,
    digest: Uint8Array<ArrayBuffer>
}

type FormatVersion = {
    alignment: number
    flags: string[]
}

export type FormatDefinition = {
    signature: [number, number, number, number],
    versions: FormatVersion[]
}

type LatestVersionFlags<
    F extends FormatDefinition
> = F["versions"] extends [...any, infer S] ? S extends FormatVersion ? S["flags"][number] : never : never

type VersionFlags<
    F extends FormatDefinition,
    V extends number = number
> = F["versions"][V]["flags"][number]

export type Header<
    F extends FormatDefinition,
    V extends number = number
> = {
    version: V
    flags: Record<VersionFlags<F, V>, boolean>
    id: bigint,
    timestamp: number,
    digest: Uint8Array<ArrayBuffer>,
    sectionTableSize: number
}