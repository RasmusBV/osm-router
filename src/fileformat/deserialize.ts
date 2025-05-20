import * as Accessors from "./accessors.js"
import * as Format from "./format.js"
import * as geokdbush from 'geokdbush';
import { Deserialized } from "../bin-helper/index.js"

const requiredSectionNames =  ["index", "nodes", "edges", "edgeList", "nodeList", "connectionsList"] as const

type RequiredSectionNames = (typeof requiredSectionNames)[number]

export type NodeObject = {
    osmId: number;
    lon: number;
    lat: number;
    edgeListIndex: number;
    edgeListLength: number;
}

export type ConnectionObject = {edgeIndex: number, cost: number}

export type EdgeObject = {
    index: number
    nodes: NodeObject[],
    fromEdges: ConnectionObject[]
    toEdges: ConnectionObject[]
}

export class GraphAccessor extends Accessors.DataAccessor<RequiredSectionNames> {
    constructor(deserialized: Deserialized<Format.FormatDefinition, Format.SectionDefinitions>) {
        super(requiredSectionNames, deserialized.header, deserialized.sections)
    }

    toObject<T extends Record<string, (index: number) => number>>(index: number, accessor: T) {
        return Object.fromEntries(
            Object.entries(accessor)
            .map(([key, accessor]) => ([key, accessor(index)]))
        ) as {[K in keyof T]: number}
    }

    getNodeObject(nodeIndex: number): NodeObject {
        return this.toObject(nodeIndex, this.accessors.nodes)
    }

    getEdgeObject(edgeIndex: number) {
        const edge: EdgeObject = {
            index: edgeIndex,
            nodes: [],
            fromEdges: [],
            toEdges: []
        }
        this.listEdgeNodes(edgeIndex, (nodeIndex) => {
            const node = this.toObject(nodeIndex, this.accessors.nodes)
            edge.nodes.push(node)
        })
        this.listFromEdges(edgeIndex, (fromEdgeIndex) => {
            edge.fromEdges.push(this.toObject(fromEdgeIndex, this.accessors.connectionsList))
        })
        this.listToEdges(edgeIndex, (toEdgeIndex) => {
            edge.fromEdges.push(this.toObject(toEdgeIndex, this.accessors.connectionsList))
        })
        return edge
    }
    getNearbyNodes(
        lon: number, 
        lat: number,
        maxResults?: number, 
        maxDistanceMeters?: number
    ) {
        return geokdbush.around(this.accessors.index as any, lon, lat, maxResults, maxDistanceMeters ? maxDistanceMeters/1000 : undefined) as number[]
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

    static async fromPath(path: string) {
        const deserialized = await Format.helper.deserialize(path)
        return new GraphAccessor(deserialized)
    }
}