import * as Format from "./format.js"
import * as Header from "./header.js"
import * as SectionTable from "./sectionTable.js"
import * as Accessors from "./accessors.js"
import type { ReadableStreamReadResult } from "stream/web"

type RetypedReadableStreamBYOBReader = Omit<ReadableStreamBYOBReader, "read"> & {
    read: <T extends ArrayBufferView>(
        view: T, 
        options?: {min?: number}
    ) => Promise<ReadableStreamReadResult<T>>
}

type Deserialized = {
    header: Format.Header;
    sections: Format.SerializedSection[];
    sectionTable: (Format.SectionTableEntry | Format.UnknownSectionTableEntry)[];
}

export async function deserialize(_reader: ReadableStreamBYOBReader): Promise<Deserialized> {
    const reader = _reader as RetypedReadableStreamBYOBReader
    const read = async(view: DataView<ArrayBuffer>, min: number, allowDone: boolean) => {
        const { done, value } = await reader.read(view, {min})
        if( (done && !allowDone) || !value ) {
            throw new Error(`Stream ended early`)
        }
        return { done, value }
    }
    const headerBuffer = await read(new DataView(new ArrayBuffer(Format.HEADER_SIZE)), Format.HEADER_SIZE, false)
    const header = Header.deserialize(headerBuffer.value)
    const sectionTableBuffer = await read(new DataView(new ArrayBuffer(header.sectionTableSize)), header.sectionTableSize, false)
    const sectionTable = SectionTable.deserialize(sectionTableBuffer.value, header)

    const sections: Format.SerializedSection[] = []
    const disposableBufferSize = 16 * 1024
    let disposableBuffer = new DataView(new ArrayBuffer(disposableBufferSize))
    for(let i = 0; i < sectionTable.length; i++) {
        const section = sectionTable[i]
        if("name" in section) {
            const { value } = await read(new DataView(new ArrayBuffer(section.size)), section.size, i === sectionTable.length-1)
            sections.push({buffer: value, name: section.name, flags: section.flags})
        } else {
            // Unknown section. Skipping
            let remaining = section.size
            while(remaining > 0) {
                const readSize = Math.min(disposableBufferSize, remaining)
                const { value } = await read(disposableBuffer, readSize, i === sectionTable.length-1)
                disposableBuffer = value
                remaining -= readSize
            }
        }
    }
    return { header, sections, sectionTable }
}

const requiredSectionNames =  ["index", "nodes", "edges", "edgeList", "nodeList", "connectionsList"] as const

type RequiredSectionNames = (typeof requiredSectionNames)[number]

export class GraphAccessor extends Accessors.DataAccessor<RequiredSectionNames> {
    constructor(deserialized: Deserialized) {
        super(requiredSectionNames, deserialized.header, deserialized.sections)
    }

    listNodeEdges(nodeIndex: number, callback: (edgeIndex: number, listIndex: number, listLength: number) => any) {
        const edgeListIndex = this.accessors.nodes.edgeListIndex(nodeIndex)
        const edgeListLength = this.accessors.nodes.edgeListLength(nodeIndex)
        for(let i = 0; i < edgeListLength; i++) {
            if(callback(this.accessors.edgeList.edgeIndex(edgeListIndex + i), i, edgeListLength) === false) { return }
        }
    }
    nodePos(nodeIndex: number): [lon: number, lat: number] {
        return [this.accessors.nodes.lon(nodeIndex), this.accessors.nodes.lat(nodeIndex)]
    }

    listEdgeNodes(edgeIndex: number, callback: (nodeIndex: number, listIndex: number, listLength: number) => any) {
        const nodeListIndex = this.accessors.edges.nodeListIndex(edgeIndex)
        const nodeListLength = this.accessors.edges.nodeListLength(edgeIndex)
        for(let i = 0; i < nodeListLength; i++) {
            if(callback(this.accessors.nodeList.nodeIndex(nodeListIndex + i), i, nodeListLength) === false) { return }
        }
    }

    listFromEdges(edgeIndex: number, callback: (edgeIndex: number, cost: number, listIndex: number, listLength: number) => any) {
        const length = this.accessors.edges.fromEdgeListLength(edgeIndex)
        const index = this.accessors.edges.fromEdgeListIndex(edgeIndex)
        return this.listEdgeConnections(index, length, callback)
    }

    listToEdges(edgeIndex: number, callback: (edgeIndex: number, cost: number, listIndex: number, listLength: number) => any) {
        const length = this.accessors.edges.toEdgeListLength(edgeIndex)
        const index = this.accessors.edges.toEdgeListIndex(edgeIndex)
        return this.listEdgeConnections(index, length, callback)
    }
    
    listEdgeConnections(index: number, length: number, callback: (edgeIndex: number, cost: number, listIndex: number, listLength: number) => any) {
        for(let i = 0; i < length; i++) {
            if(callback(
                this.accessors.connectionsList.edgeIndex(index+i),
                this.accessors.connectionsList.cost(index+i),
                i,
                length
            ) === false) { return }
        }
    }

    static async fromReadable(reader: ReadableStreamBYOBReader) {
        const deserialized = await deserialize(reader)
        return new GraphAccessor(deserialized)
    }
}