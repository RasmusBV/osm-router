import * as Format from "./format.js"
import { Header, SerializedSection, Accessor, generateAccessor } from "../bin-helper/index.js"
import KDBush from "kdbush"

export class DataAccessor<T extends Format.SectionNames> {
    sections: {
        [K in T]: SerializedSection<Format.SectionDefinitions, K>
    } = {} as any

    accessors: {
        [K in T]: ReturnType<(typeof accessors)[K]>["accessors"]
    } = {} as any

    sizes: {
        [K in T]: number
    } = {} as any

    constructor(
        sectionNames: readonly T[],
        public header: Header<Format.FormatDefinition>,
        sections: SerializedSection<Format.SectionDefinitions, Format.SectionNames>[]
    ) {
        for(const section of sections) {
            if(!sectionNames.includes(section.name as T)) { continue }
            if(section.name in this.sections) {
                throw new Error(`Multiple sections labled ${section.name}`)
            }
            const accessor = readSection(header, section)
            this.sections[section.name as T] = section as any
            this.accessors[section.name as T] = accessor.accessors as any
            this.sizes[section.name as T] = accessor.size
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
    [K in Format.SectionNames]: (header: Header<Format.FormatDefinition>, section: SerializedSection<Format.SectionDefinitions, K>) => any
}

export function readSection<T extends Format.SectionNames>(header: Header<Format.FormatDefinition>, section: SerializedSection<Format.SectionDefinitions, T>) {
    return accessors[section.name](header, section as any) as ReturnType<(typeof accessors)[T]>
}

export function readNodes(header: Header<Format.FormatDefinition>, nodes: SerializedSection<Format.SectionDefinitions, "nodes">) {
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
    return generateAccessor(nodes.buffer, accessors, !header.flags.bigEndian, 8)
}

export function readEdges(header: Header<Format.FormatDefinition>, edges: SerializedSection<Format.SectionDefinitions, "edges">){
    const indexMethod = header.flags.indexSizes ? "getBigUint64" : "getUint32"
    const accessors = [{
        name: "nodeListLength",
        method: "getUint16"
    }, {
        name: "toEdgeListLength",
        method: "getUint8"
    }, {
        name: "fromEdgeListLength",
        method: "getUint8"
    }, {
        name: "length",
        method: "getFloat32"
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
    return generateAccessor(edges.buffer, accessors, !header.flags.bigEndian, 8)
}

export function readConnectionsList(header: Header<Format.FormatDefinition>, connectionsList: SerializedSection<Format.SectionDefinitions, "connectionsList">) {
    const accessors = [{
        name: "edgeIndex",
        method: header.flags.indexSizes ? "getBigUint64" : "getUint32"
    }, {
        name: "cost",
        method: "getFloat32"
    }] as const satisfies Accessor[]
    return generateAccessor(connectionsList.buffer, accessors, !header.flags.bigEndian, 8)
}

export function readEdgeList(header: Header<Format.FormatDefinition>, edgeList: SerializedSection<Format.SectionDefinitions, "edgeList">) {
    const accessors = [{
        name: "edgeIndex",
        method: header.flags.indexSizes ? "getBigUint64" : "getUint32"
    }] as const satisfies Accessor[]
    return generateAccessor(edgeList.buffer, accessors, !header.flags.bigEndian, 4)
}

export function readNodeList(header: Header<Format.FormatDefinition>, nodeList: SerializedSection<Format.SectionDefinitions, "nodeList">) {
    const accessors = [{
        name: "nodeIndex",
        method: header.flags.indexSizes ? "getBigUint64" : "getUint32"
    }] as const satisfies Accessor[]
    return generateAccessor(nodeList.buffer, accessors, !header.flags.bigEndian, 4)
}

export function readIndex(header: Header<Format.FormatDefinition>, index: SerializedSection<Format.SectionDefinitions, "index">) {
    return {
        size: index.buffer.buffer.byteLength,
        accessors: KDBush.from(index.buffer.buffer)
    }
}

export function readMetadata(header: Header<Format.FormatDefinition>, metadata: SerializedSection<Format.SectionDefinitions, "metadata">) {
    const text = new TextDecoder().decode(metadata.buffer)
    const object = JSON.parse(text)
    return {
        size: metadata.buffer.byteLength,
        accessors: object as Format.Metadata | object
    }
}