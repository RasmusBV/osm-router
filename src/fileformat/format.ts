export const FILE_SIGNATURE = [0x9c, 0x9c, 0x44, 0x47]

export const MAJOR_VERSION = 1
export const MINOR_VERSION = 1

export const HEADER_OFFSETS = {
    SIGNATURE: 0x00,
    MAJOR_VERSION: 0x04,
    MINOR_VERSION: 0x05,
    FLAGS: 0x07,
    GRAPH_ID: 0x08,
    TIMESTAMP: 0x10,
    DIGEST: 0x18,
    SECTION_TABLE_SIZE: 0x2c
} as const

export const HEADER_SIZE = 48

export type Header = {
    majorVersion: number,
    minorVersion: number,
    flags: Flags<"header">,
    id: bigint,
    timestamp: number,
    digest: Uint8Array<ArrayBuffer>,
    sectionTableSize: number
}

export const DIGEST_SIZE = 20

export const SECTIONS = ["metadata", "nodes", "edges", "edgeList", "nodeList", "connectionsList", "index"] as const
export type SectionName = typeof SECTIONS[number]

const SECTION_TYPES = [
    [0x0001, "metadata"],
    [0x0002, "nodes"],
    [0x0003, "edges"],
    [0x0004, "edgeList"],
    [0x0005, "nodeList"],
    [0x0006, "connectionsList"],
    [0x0007, "index"]
] as const

export const SECTION_TYPE_MAP = new Map<number, SectionName>(SECTION_TYPES)
export const REVERSE_SECTION_TYPE_MAP = new Map<SectionName, number>(SECTION_TYPES.map(([id, name]) => [name, id]))

export const SECTION_TABLE_ENTRY_OFFSETS = {
    SIZE: 0x00,
    ID: 0x08,
    FLAGS: 0x0a,
    DIGEST: 0x0c
} as const

export const SECTION_TABLE_ENTRY_SIZE = 32

export const SECTION_FLAGS = {
    nodes: ["coordinatePrecision"] as const,
    index: ["indexType"] as const,
    header: ["bigEndian", "indexSizes"] as const
}satisfies Partial<Record<SectionName | "header", string[]>>

export const padToByteBoundary = (val: number, boundary = 8) => Math.ceil(val / boundary) * boundary

export function createArrayBuffer(size: number) {
    return new DataView(new ArrayBuffer(padToByteBoundary(size)))
}
export const SECTION_ELEMENT_SIZE = {
    nodes: (coordinateBytes: number, indexBytes: number) => {
        return padToByteBoundary(10 + (2 * coordinateBytes) + indexBytes)
    },
    edges: (indexBytes: number) => {
        return padToByteBoundary(8 + (3 * indexBytes))
    },
    edgeList: (indexBytes: number) => indexBytes,
    nodeList: (indexBytes: number) => indexBytes,
    connectionsList: (indexBytes: number) => padToByteBoundary(4 + indexBytes)
} satisfies Partial<Record<SectionName, (...args: any) => number>>

export type SerializedSection<T extends SectionName = SectionName> = {
    buffer: DataView<ArrayBuffer>
    name: T,
    flags: Flags<T>
}

export type SectionTableEntry<T extends SectionName = SectionName> = {
    size: number
    digest: Uint8Array<ArrayBuffer>
    name: T
    flags: Flags<T>
}

export type UnknownSectionTableEntry = {
    id: number
    size: number,
    digest: Uint8Array<ArrayBuffer>
}


export function encodeBitFlags<T extends string>(section: T, flags: Flags<T>) {
    let encoded = 0
    if(!(section in SECTION_FLAGS)) { return encoded }
    const flagNames = SECTION_FLAGS[section as keyof typeof SECTION_FLAGS]
    for(let i = 0; i < flagNames.length; i++) {
        const flagValue = flags[flagNames[i] as keyof Flags<T>]
        if(!flagValue) { continue }
        encoded = encoded | ( 1<<i )
    }
    return encoded
}

export type Flags<T extends string> = T extends keyof typeof SECTION_FLAGS ? {
    [K in typeof SECTION_FLAGS[T][number]]: boolean
} : {}

export function decodeBitFlags<T extends string>(section: T, encoded: number) {
    if(!(section in SECTION_FLAGS)) { return { } as Flags<T> }
    const sectionFlags = SECTION_FLAGS[section as keyof typeof SECTION_FLAGS]
    return Object.fromEntries(sectionFlags.map((name, i) => [name, ( encoded & (1<<i)) !== 0])) as Flags<T>
}

export type Metadata = Partial<{
    bbox: [west: number, south: number, east: number, north: number],
    notes: string,
    writingprogram: string
}> & Record<string, any>