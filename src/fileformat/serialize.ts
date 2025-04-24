import KDBush from "kdbush"
import * as Format from "./format.js"
import { Graph } from "../preprocess/index.js"
import * as OSM from "../types.js"
import * as Header from "./header.js"
import * as SectionTable from "./sectionTable.js"

type Options = {
    endianness: "big" | "little"
    coordinatePrecision: "single" | "double"
    indexAllNodes: boolean
    metadata: Format.Metadata
}

const defaultOptions: Options = {
    endianness: "little",
    coordinatePrecision: "single",
    indexAllNodes: false,
    metadata: {}
}

const defaultMetadata = {
    writingprogram: "osm-router-0.0.0"
} satisfies Format.Metadata

export type SerializeResult = {
    layout: Layout
    header: Format.Header,
    sectionTable: Format.SectionTableEntry[]
    index: KDBush,
    out: DataView<ArrayBuffer>[]
}

export async function serialize<T extends Partial<Options>>(graph: Graph, opts: T = {} as T): Promise<SerializeResult> {
    const options = {...defaultOptions, ...opts}
    const metadata = { ...defaultMetadata, ...options.metadata }
    
    const layout = createLayout(graph)

    const index = serializeIndex(graph, options)
    const nodeMap = serializeNodeMap(graph, layout, options)
    const edges = serializeEdges(graph, layout, options)
    const serializedMetadata = new TextEncoder().encode(JSON.stringify(metadata)) as Uint8Array<ArrayBuffer>
    const serializedSections: Format.SerializedSection[] = [
        {
            name: "metadata",
            buffer: new DataView(serializedMetadata.buffer.slice(
                serializedMetadata.byteOffset, 
                serializedMetadata.byteOffset + serializedMetadata.byteLength
            )),
            flags: {}
        },
        ...nodeMap, 
        ...edges,
        {
            name: "index",
            buffer: new DataView(index.data),
            flags: Format.encodeBitFlags("index", {indexType: options.indexAllNodes})
        }
    ]
    const sectionTableEntries = await Promise.all(serializedSections.map((section) => SectionTable.generateTableEntry(section)))
    const sectionTableSize = sectionTableEntries.length * Format.SECTION_TABLE_ENTRY_SIZE
    const header: Omit<Format.Header, "digest"> = {
        majorVersion: Format.MAJOR_VERSION,
        minorVersion: Format.MINOR_VERSION,
        flags: {
            bigEndian: options.endianness === "big",
            indexSizes: layout.useBigIntIndex,
            signedCost: layout.useSignedCost
        },
        id: globalThis.crypto.getRandomValues(new BigUint64Array(1))[0],
        timestamp: Date.now(),
        sectionTableSize
    }
    const headerAndSectionTableBuffer = new ArrayBuffer(sectionTableSize + Format.HEADER_SIZE)
    Header.serialize(header, new DataView(headerAndSectionTableBuffer, 0, Format.HEADER_SIZE))
    SectionTable.serialize(sectionTableEntries, new DataView(headerAndSectionTableBuffer, Format.HEADER_SIZE, sectionTableSize), header)
    const digest = await Header.writeDigest(new DataView(headerAndSectionTableBuffer))

    const out = [new DataView(headerAndSectionTableBuffer), ...serializedSections.map((section) => section.buffer)]

    return { layout, header: {...header, digest}, sectionTable: sectionTableEntries, index, out }
}

function createArrayBuffer(size: number) {
    return new DataView(new ArrayBuffer(Format.padToByteBoundary(size)))
}

function serializeNodeMap(graph: Graph, layout: Layout, options: Options): Format.SerializedSection[] {

    const littleEndian = options.endianness === "little"
    
    const useSingle = options.coordinatePrecision === "single"
    const coordinateBytes = useSingle ? 4 : 8
    
    const useBigIntIndex = layout.useBigIntIndex
    const indexBytes = useBigIntIndex ? 8 : 4

    const nodesSize = Format.SECTION_ELEMENT_SIZE.nodes(coordinateBytes, indexBytes)
    const nodesBuffer = createArrayBuffer(layout.lengths.nodes * nodesSize)
    let nodeIndex = 0

    const edgeListSize = Format.SECTION_ELEMENT_SIZE.edgeList(indexBytes)
    const edgeListBuffer = createArrayBuffer(layout.lengths.edgeList * edgeListSize)
    let edgeListIndex = 0

    for(const id of layout.nodes.keys()) {
        const node = graph.nodes.get(id)
        if(!node) { throw new Error("") }
        let offset = nodeIndex * nodesSize
        nodesBuffer.setBigUint64(offset, BigInt(id), littleEndian)
        offset += 8
        if(useSingle) {
            nodesBuffer.setFloat32(offset, node.pos[0], littleEndian)
            nodesBuffer.setFloat32(offset + 4, node.pos[1], littleEndian)
            offset += 8
        } else {
            nodesBuffer.setFloat64(offset, node.pos[0], littleEndian)
            nodesBuffer.setFloat64(offset + 8, node.pos[1], littleEndian)
            offset += 16
        }
        if(useBigIntIndex) {
            nodesBuffer.setBigUint64(offset, BigInt(edgeListIndex), littleEndian)
            offset += 8
        } else {
            nodesBuffer.setUint32(offset, edgeListIndex, littleEndian)
            offset += 4
        }
        nodesBuffer.setUint16(offset, node.edges.size, littleEndian)
        nodeIndex++
        for(const edge of node.edges.values()) {
            const edgeIndex = layout.edges.get(edge.nodes[0])?.get(edge.nodes[edge.nodes.length - 1])
            if(edgeIndex === undefined) { throw new Error("") }
            const edgeListOffset = edgeListIndex * edgeListSize
            if(useBigIntIndex) {
                edgeListBuffer.setBigUint64(edgeListOffset, BigInt(edgeIndex), littleEndian)
            } else {
                edgeListBuffer.setUint32(edgeListOffset, edgeIndex, littleEndian)
            }
            edgeListIndex++
        }
    }
    return [
        {
            name: "nodes",
            buffer: nodesBuffer,
            flags: Format.encodeBitFlags("nodes", {coordinatePrecision: coordinateBytes === 8})
        },
        {
            name: "edgeList",
            buffer: edgeListBuffer,
            flags: {}
        }
    ]
}

function serializeEdges(graph: Graph, layout: Layout, options: Options): Format.SerializedSection[] {
    const littleEndian = options.endianness === "little"
    const maxCost = layout.useSignedCost ? 0x7FFF : 0xFFFF
    const minCost = layout.useSignedCost ? -0x8000 : 0x0000
    const useBigIntIndex = layout.useBigIntIndex
    const indexBytes = useBigIntIndex ? 8 : 4

    const edgesSize = Format.SECTION_ELEMENT_SIZE.edges(indexBytes)
    const edgesBuffer = createArrayBuffer(layout.lengths.edges * edgesSize)
    let edgeIndex = 0

    const nodeListSize = Format.SECTION_ELEMENT_SIZE.nodeList(indexBytes)
    const nodeListBuffer = createArrayBuffer(layout.lengths.nodeList * nodeListSize)
    let nodeListIndex = 0

    const connectionsListSize = Format.SECTION_ELEMENT_SIZE.connectionsList(indexBytes)
    const connectionsListBuffer = createArrayBuffer(layout.lengths.connectionsList * connectionsListSize)
    let connectionsListIndex = 0

    const writeCost = (buffer: DataView<ArrayBuffer>, offset: number, cost: number) => {
        const truncatedCost = Math.max(minCost, Math.min(maxCost, cost))
        if(layout.useSignedCost) {
            buffer.setInt16(offset, truncatedCost, littleEndian)
        } else {
            buffer.setUint16(offset, truncatedCost, littleEndian)
        }
    }
    const writeIndex = (buffer: DataView<ArrayBuffer>, offset: number, index: number) => {
        if(useBigIntIndex) {
            buffer.setBigUint64(offset, BigInt(index), littleEndian)
            return 8
        } else {
            buffer.setUint32(offset, index, littleEndian)
            return 4
        }
    }

    const writeConnection = (from: OSM.NodeId, to: OSM.NodeId, cost: number) => {
        const edgeIndex = layout.edges.get(from)?.get(to)
        if(edgeIndex === undefined) { throw new Error("") }
        let connectionsListOffset = connectionsListIndex * connectionsListSize
        connectionsListOffset += writeIndex(connectionsListBuffer, connectionsListOffset, edgeIndex)
        writeCost(connectionsListBuffer, connectionsListOffset, cost)
        connectionsListIndex++
    }

    for(const [from, vias] of layout.edges) {
        for(const via of vias.keys()) {
            const edge = graph.edges.get(from)?.get(via)
            if(!edge) { throw new Error("") }
            let offset = edgeIndex * edgesSize
            
            writeCost(edgesBuffer, offset, edge.cost)
            edgesBuffer.setUint16(offset + 2, edge.nodes.length, littleEndian)
            edgesBuffer.setUint16(offset + 4, edge.to.size, littleEndian)
            edgesBuffer.setUint16(offset + 6, edge.from.size, littleEndian)
            offset += 8

            offset += writeIndex(edgesBuffer, offset, nodeListIndex)
            offset += writeIndex(edgesBuffer, offset, connectionsListIndex)

            for(const node of edge.nodes) {
                const nodeIndex = layout.nodes.get(node)
                if(nodeIndex === undefined) { throw new Error("") }
                const nodeListOffset = nodeListIndex * nodeListSize
                writeIndex(nodeListBuffer, nodeListOffset, nodeIndex)
                nodeListIndex++
            }

            for(const [to, cost] of edge.to) {
                writeConnection(via, to, cost)
            }
            writeIndex(edgesBuffer, offset, connectionsListIndex)
            for(const [from, cost] of edge.from) {
                writeConnection(from, via, cost)
            }

            edgeIndex++
        }
    }
    return [
        {
            name: "edges",
            buffer: edgesBuffer,
            flags: {}
        },
        {
            name: "nodeList",
            buffer: nodeListBuffer,
            flags: {}
        },
        {
            name: "connectionsList",
            buffer: connectionsListBuffer,
            flags: {}
        }
    ]
}

export type Layout = {
    nodes: Map<OSM.NodeId, number>,
    edges: Map<OSM.NodeId, Map<OSM.NodeId, number>>,
    useBigIntIndex: boolean
    costAreTruncated: boolean
    useSignedCost: boolean
    lengths: {
        nodes: number,
        edges: number,
        nodeList: number,
        edgeList: number,
        connectionsList: number
    }
}


function createLayout(graph: Graph): Layout {
    const nodeMap = new Map<OSM.NodeId, number>()
    let nodeIndex = 0
    let edgeListSize = 0

    for(const node of graph.edges.keys()) {
        nodeMap.set(node, nodeIndex++)
    }
    for(const [id, node] of graph.nodes) {
        edgeListSize += node.edges.size
        if(nodeMap.has(id)) { continue }
        nodeMap.set(id, nodeIndex++)
    }
    let maxCost = 0
    let minCost = 0
    let edgeIndex = 0
    let nodeListSize = 0
    let connectionsListSize = 0
    const edgeMap = new Map<OSM.NodeId, Map<OSM.NodeId, number>>()
    for(const [from, vias] of graph.edges) {
        let edges = edgeMap.get(from)
        if(!edges) {
            edges = new Map()
            edgeMap.set(from, edges)
        }
        for(const [id, edge] of vias) {
            maxCost = Math.max(edge.cost, maxCost, ...edge.to.values())
            minCost = Math.min(edge.cost, minCost, ...edge.to.values())
            nodeListSize += edge.nodes.length
            connectionsListSize += (edge.to.size + edge.from.size)
            edges.set(id, edgeIndex++)
        }
    }
    const lengths = {
        nodes: nodeIndex, 
        edges: edgeIndex, 
        nodeList: nodeListSize, 
        edgeList: edgeListSize, 
        connectionsList: connectionsListSize
    }
    const useBigIntIndex = Object.values(lengths).some((value) => value > 0xFFFFFFFF)
    const useSignedCost = minCost < 0
    const costAreTruncated = maxCost > (useSignedCost ? 0x7FFF : 0xFFFF)
    return {
        nodes: nodeMap,
        edges: edgeMap,
        useBigIntIndex,
        costAreTruncated,
        useSignedCost,
        lengths
    }
}

function serializeIndex(graph: Graph, options: Options) {
    const indexSize = options.indexAllNodes ? graph.nodes.size : graph.edges.size
    const arrayType = options.coordinatePrecision === "single" ? Float32Array : Float64Array
    const index = new KDBush(indexSize, 64, arrayType)
    for(const node of graph.edges.keys()) {
        const info = graph.nodes.get(node)
        if(!info) { throw new Error("") }
        index.add(...info.pos)
    }
    if(options.indexAllNodes) {
        for(const [id, info] of graph.nodes) {
            if(graph.edges.has(id)) { continue }
            index.add(...info.pos)
        }
    }

    index.finish()
    return index
}