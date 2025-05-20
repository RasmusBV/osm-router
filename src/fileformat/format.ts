import * as Bin from "../bin-helper/index.js"

export const format = {
    signature: [0x9c, 0x9c, 0x44, 0x47],
    versions: [{
        alignment: 8,
        flags: ["bigEndian", "indexSizes"],
    }]
} as const satisfies Bin.FormatDefinition

export type FormatDefinition = typeof format

export const sections = [
    {id: 0x0001, name: "metadata"},
    {id: 0x0002, name: "nodes", flags: ["coordinatePrecision"]},
    {id: 0x0003, name: "edges"},
    {id: 0x0004, name: "edgeList"},
    {id: 0x0005, name: "nodeList"},
    {id: 0x0006, name: "connectionsList"},
    {id: 0x0007, name: "index", flags: ["indexType"]}
] as const satisfies Bin.SectionDefinition[]

export type SectionDefinitions = typeof sections

export type Sections = Bin.SectionNameMap<typeof sections>
export type SectionNames = Bin.SectionNames<typeof sections>

export const helper = new Bin.Format(format, sections)

export type Metadata = Partial<{
    bbox: [west: number, south: number, east: number, north: number],
    notes: string,
    writingprogram: string
}> & Record<string, any>


export const padToByteBoundary = (val: number, boundary = 8) => Math.ceil(val / boundary) * boundary

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
}
