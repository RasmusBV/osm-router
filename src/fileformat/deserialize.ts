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
    length: number
    nodes: NodeObject[],
    fromEdges: ConnectionObject[]
    toEdges: ConnectionObject[]
}

export class GraphAccessor extends Accessors.DataAccessor<RequiredSectionNames> {
    constructor(deserialized: Deserialized<Format.FormatDefinition, Format.SectionDefinitions>) {
        super(requiredSectionNames, deserialized.header, deserialized.sections)
    }

    getNearbyNodes(
        lon: number, 
        lat: number,
        maxResults?: number, 
        maxDistanceMeters?: number
    ) {
        return geokdbush.around(this.accessors.index as any, lon, lat, maxResults, maxDistanceMeters ? maxDistanceMeters/1000 : undefined) as number[]
    }
    getNearbyEdges(
        lon: number, 
        lat: number,
        maxResults = Infinity,
        maxDistanceMeters = 50
    ) {
        const nodes = this.getNearbyNodes(lon, lat, maxResults, maxDistanceMeters)
        const edges: number[] = []
        for(const nodeId of nodes) {
            this.listNodeEdges(nodeId, (edgeIndex) => {
                edges.push(edgeIndex)
            })
        }
        return edges
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