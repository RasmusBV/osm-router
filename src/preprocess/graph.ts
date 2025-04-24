import { WarningType } from "../warnings.js";
import * as OSM from "../types.js"
import { OSMData } from "./data.js";
import getAngle from "@turf/angle"
import { buildRestrictionMap, Restriction, isAllowed } from "./restrictions.js";
import { buildJunctionMap, Junction } from "./junctions.js";

export type ProcessTurn = (
    turn: Readonly<Turn>,
    junction: Readonly<Junction>, 
    data: OSMData
) => number | undefined

export type Turn = {
    fromNode: OSM.Node, 
    fromEdge: OSM.Edge
    fromClosest: OSM.Node,

    viaNode: OSM.Node, 

    toNode: OSM.Node, 
    toEdge: OSM.Edge,
    toClosest: OSM.Node,

    angle: number
    restrictions: Restriction[] | undefined
}

/**
 * An Edge Expanded graph in the format
 * 
 * fromNode -> viaNode -> Edge info + valid toNodes
 * 
 * Traversal is done by indexing with **(fromNode, viaNode)** to obtain an edge,
 * then each connection references a valid edge **(viaNode, toNode)**,
 * and the cost associated with the manoeuvre
 */
export type EdgeExpandedGraph = Map<OSM.NodeId, Map<OSM.NodeId, {

    /**All nodes between fromNode and viaNode. */
    nodes: OSM.NodeId[],

    /**All valid connections with associated costs. */
    to: Map<OSM.NodeId, number> 
    from: Map<OSM.NodeId, number>

}>>

export type NodeMap = Map<OSM.NodeId, {pos: [lon: number, lat: number], edges: Set<OSM.Edge>}>

export type Graph = {
    edges: EdgeExpandedGraph,
    nodes: NodeMap
}

export function buildGraph(data: OSMData, processTurn: ProcessTurn = () => 0) {
    const junctions = buildJunctionMap(data)
    const restrictionMap = buildRestrictionMap(data)
    const graph: Graph = {
        edges: new Map(),
        nodes: new Map()
    }
    
    const turn = {} as Turn
    for(const [viaNode, toJunction] of junctions) {
        for(const [fromNode, fromEdge] of toJunction.from) {
            for(const [toNode, toEdge] of toJunction.to) {
                if(isAllowed(fromEdge.way, viaNode, toEdge.way, restrictionMap)) {
                    continue
                }

                const fromClosest = getClosestNode(fromEdge.way, fromNode.id, viaNode.id, data)
                const toClosest = getClosestNode(toEdge.way, toNode.id, viaNode.id, data)
                if(!fromClosest || !toClosest) { continue }

                turn.fromNode = fromNode
                turn.fromEdge = fromEdge
                turn.fromClosest = fromClosest

                turn.toNode = toNode
                turn.toEdge = toEdge
                turn.toClosest = toClosest

                turn.angle = getAngle(
                    [fromClosest.lon, fromClosest.lat], 
                    [viaNode.lon, viaNode.lat], 
                    [toClosest.lon, toClosest.lat]
                ) - 180

                turn.restrictions = restrictionMap.get(fromEdge.way)?.get(viaNode)?.get(toEdge.way)

                const cost = processTurn(turn, toJunction, data)
                if(cost === undefined) { continue }

                // Unsure about the cost calculation
                const totalCost = cost + toEdge.cost / 2 + fromEdge.cost / 2
                getExpandedEdge(viaNode, toNode, junctions, graph, data)?.from.set(fromNode.id, cost + toEdge.cost)
                getExpandedEdge(fromNode, viaNode, junctions, graph, data)?.to.set(toNode.id, cost + fromEdge.cost)
            }
        }
    }
    return graph
}

function getClosestNode(way: OSM.ProcessedWay, anchor: OSM.NodeId, via: OSM.NodeId, data: OSMData) {
    const anchorNodeIndex = way.refs.indexOf(anchor)
    const viaNodeIndex = way.refs.indexOf(via)
    if(anchorNodeIndex === -1 || viaNodeIndex === -1) { return undefined }
    const closestNodeIndex = viaNodeIndex + (anchorNodeIndex < viaNodeIndex ? -1 : 1 )
    return data.nodes.get(way.refs[closestNodeIndex])
}

function getExpandedEdge(
    from: OSM.Node,
    to: OSM.Node,
    junctions: Map<OSM.Node, Junction>,
    graph: Graph,
    data: OSMData
) {
    const edgeInfo = junctions.get(from)?.to.get(to)
    if(!edgeInfo) {
        data.warn(WarningType.MissingEdge, {from, to})
        return
    }
    let edges = graph.edges.get(from.id)
    if(!edges) {
        edges = new Map()
        graph.edges.set(from.id, edges)
    }
    let edge = edges.get(to.id)
    if(!edge) {
        for(const nodeId of edgeInfo.nodes) {
            const node = data.nodes.get(nodeId)
            if(!node) { continue }
            let nodeInfo = graph.nodes.get(nodeId)
            if(!nodeInfo) {
                nodeInfo = {pos: [node.lon, node.lat], edges: new Set()}
                graph.nodes.set(nodeId, nodeInfo)
            }
            nodeInfo.edges.add(edgeInfo)
        }
        edge = {
            nodes: edgeInfo.nodes,
            to: new Map(),
            from: new Map()
        }
        edges.set(to.id, edge)
    }
    return edge
}