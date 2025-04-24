import * as Format from "./format.js"
import KDBush from "kdbush"

const DATA_VIEW_ACCESSORS = {
    getFloat16: 2,
    getFloat32: 4,
    getFloat64: 8,

    getInt8: 1,
    getInt16: 2,
    getInt32: 4,
    getBigInt64: 8,

    getUint8: 1,
    getUint16: 2,
    getUint32: 4,
    getBigUint64: 8
} as const

type NamedAccessor<T extends string> = {
    readonly name: T
    readonly method: keyof typeof DATA_VIEW_ACCESSORS
}

export type Accessor = NamedAccessor<string> | {
    readonly padding: number
}

type DataAccessors<T extends readonly Accessor[]> = {
    -readonly [K in keyof T as T[K] extends NamedAccessor<infer S> ? S : never]: (index: number) => number
}

function generateAccessor<T extends readonly Accessor[]>(
    buffer: DataView<ArrayBuffer>, 
    accessors: T,
    littleEndian: boolean,
    padToByteBoundary: boolean
) {
    let size = 0
    const obj: Record<string, (index: number) => number> = {}
    for(const accessor of accessors) {
        if("padding" in accessor) {
            size += accessor.padding
            continue
        }
        const accessorOffset = size
        size += DATA_VIEW_ACCESSORS[accessor.method]
        obj[accessor.name] = (index: number) => {
            const offset = index * size + accessorOffset
            return Number(buffer[accessor.method](offset, littleEndian))
        }
    }
    if(padToByteBoundary) {
        size = Format.padToByteBoundary(size)
    }
    return obj as DataAccessors<T>
}

export class DataAccessor<T extends Format.SectionName> {
    sections: {
        [K in T]: Format.SerializedSection<K>
    } = {} as any

    accessors: {
        [K in T]: ReturnType<(typeof accessors)[K]>
    } = {} as any

    constructor(
        sectionNames: readonly T[],
        public header: Format.Header,
        sections: Format.SerializedSection[]
    ) {
        for(const section of sections) {
            if(!sectionNames.includes(section.name as T)) { continue }
            if(section.name in this.sections) {
                throw new Error(`Multiple sections labled ${section.name}`)
            }
            const accessor = readSection(header, section)
            this.sections[section.name as T] = section as any
            this.accessors[section.name as T] = accessor as any
        }
    }
}

export const accessors = {
    nodes: readNodes,
    edges: readEdges,
    connectionsList: readConnectionsList,
    edgeList: readEdgeList,
    nodeList: readNodeList,
    index: readIndex,
    metadata: readMetadata
} satisfies {
    [K in Format.SectionName]: (header: Format.Header, section: Format.SerializedSection<K>) => any
}

export function readSection<T extends Format.SectionName>(header: Format.Header, section: Format.SerializedSection<T>) {
    return accessors[section.name](header, section as any) as ReturnType<(typeof accessors)[T]>
}

export function readNodes(header: Format.Header, nodes: Format.SerializedSection<"nodes">) {
    const coordinateAccessMethod = nodes.flags.coordinatePrecision ? "getFloat64" : "getFloat32"
    const accessors = [{
        name: "osmId",
        method: "getBigUint64"
    }, {
        name: "lon",
        method: coordinateAccessMethod
    }, {
        name: "lat",
        method: coordinateAccessMethod
    }, {
        name: "edgeListIndex",
        method: header.flags.indexSizes ? "getBigUint64" : "getUint32"
    }, {
        name: "edgeListLength",
        method: "getUint16"
    }] as const satisfies Accessor[]
    return generateAccessor(nodes.buffer, accessors, !header.flags.bigEndian, true)
}

export function readEdges(header: Format.Header, edges: Format.SerializedSection<"edges">){
    const indexMethod = header.flags.indexSizes ? "getBigUint64" : "getUint32"
    const costMethod = header.flags.signedCost ? "getInt16" : "getUint16"
    const accessors = [{
        name: "nodeListLength",
        method: "getUint16"
    }, {
        name: "toEdgeListLength",
        method: "getUint16"
    }, {
        name: "fromEdgeListLength",
        method: "getUint16"
    }, {
        padding: 2
    }, {
        name: "nodeListIndex",
        method: indexMethod
    }, {
        name: "toEdgeListIndex",
        method: indexMethod
    }, {
        name: "fromEdgeListIndex",
        method: indexMethod
    }] as const satisfies Accessor[]
    return generateAccessor(edges.buffer, accessors, !header.flags.bigEndian, true)
}

export function readConnectionsList(header: Format.Header, connectionsList: Format.SerializedSection<"connectionsList">) {
    const accessors = [{
        name: "edgeIndex",
        method: header.flags.indexSizes ? "getBigUint64" : "getUint32"
    }, {
        name: "cost",
        method: header.flags.signedCost ? "getInt16" : "getUint16"
    }] as const satisfies Accessor[]
    return generateAccessor(connectionsList.buffer, accessors, !header.flags.bigEndian, true)
}

export function readEdgeList(header: Format.Header, edgeList: Format.SerializedSection<"edgeList">) {
    const accessors = [{
        name: "edgeIndex",
        method: header.flags.indexSizes ? "getBigUint64" : "getUint32"
    }] as const satisfies Accessor[]
    return generateAccessor(edgeList.buffer, accessors, !header.flags.bigEndian, false)
}

export function readNodeList(header: Format.Header, nodeList: Format.SerializedSection<"nodeList">) {
    const accessors = [{
        name: "nodeIndex",
        method: header.flags.indexSizes ? "getBigUint64" : "getUint32"
    }] as const satisfies Accessor[]
    return generateAccessor(nodeList.buffer, accessors, !header.flags.bigEndian, false)
}

export function readIndex(header: Format.Header, index: Format.SerializedSection<"index">) {
    return KDBush.from(index.buffer.buffer)
}

export function readMetadata(header: Format.Header, metadata: Format.SerializedSection<"metadata">) {
    const text = new TextDecoder().decode(metadata.buffer)
    const object = JSON.parse(text)
    return object as Format.Metadata | object
}