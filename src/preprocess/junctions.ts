import * as OSM from "../types.js"
import type { OSMData } from "./data.js"
import * as geokdbush from 'geokdbush';
import { Info } from "../logging.js";

export type Junction<D extends OSM.CustomData> = { to: Map<OSM.ProcessedNode<D["node"]>, OSM.Edge<D["way"]>>, from: Map<OSM.ProcessedNode<D["node"]>, OSM.Edge<D["way"]>> }
export type JunctionMap<D extends OSM.CustomData> = Map<OSM.ProcessedNode<D["node"]>, Junction<D>>

export function buildJunctionMap<D extends OSM.CustomData>(data: OSMData<D>) {
    const junctions: JunctionMap<D> = new Map()

    let size = 0
    let totalLength = 0
    const segment: OSM.ProcessedNode<D["node"]>[] = []
    for(const way of data.ways.values()) {
        if(way.refs.length <= 1) {
            data.emit("warning", new Info.ErrorLike("Malformed Way", { way }))
            continue
        }
        const firstNode = data.nodes.get(way.refs[0])
        if(!firstNode) {
            data.emit("warning", new Info.ErrorLike(
                "Missing Node",
                { nodeId: way.refs[0], way }
            ))
            continue
        }
        segment[0] = firstNode
        size = 1
        totalLength = 0
        for(let i = 1; i < way.refs.length; i++) {
            const current = data.nodes.get(way.refs[i])
            if(!current) { 
                data.emit("warning", new Info.ErrorLike(
                    "Missing Node",
                    { nodeId: way.refs[i], way }
                ))
                continue 
            }
            const last = segment[size-1]
            const length = geokdbush.distance(last.lon, last.lat, current.lon, current.lat) * 1000
            totalLength += length
            segment[size++] = current
            if(
                (data.nodeToWayMap.get(current.id)?.length ?? 0) <= 1 && 
                i !== way.refs.length-1
            ) { continue }
            const first = segment[0]
            let lastJunction = getJunctions(junctions, first)
            let currentJunction = getJunctions(junctions, current)

            if(!way.innaccessible[OSM.Direction.Forward]) {
                const edge: OSM.Edge<D["way"]> = {
                    way, 
                    length: totalLength,
                    cost: (totalLength / way.speed[OSM.Direction.Forward]) * way.multiplier[OSM.Direction.Forward], 
                    nodes: Array.from({length: size}, (_, i) => segment[i].id)
                }
                lastJunction.to.set(current, edge)
                currentJunction.from.set(first, edge)
            }
            if(!way.innaccessible[OSM.Direction.Backward]) {
                const edge: OSM.Edge<D["way"]> = {
                    way, 
                    length: totalLength,
                    cost: (totalLength / way.speed[OSM.Direction.Backward]) * way.multiplier[OSM.Direction.Backward], 
                    nodes: Array.from({length: size}, (_, i) => segment[size - 1 - i].id)
                }
                lastJunction.from.set(current, edge)
                currentJunction.to.set(first, edge)
            }
            totalLength = 0
            segment[0] = current
            size = 1
        }
    }
    for(const [node, junction] of junctions) {
        if(junction.to.size !== 1 || junction.from.size !== 1) { continue }
        const [to, toEdge] = junction.to.entries().next().value!
        const [from, fromEdge] = junction.from.entries().next().value!
        if(fromEdge.way !== toEdge.way) { continue }
        const fromJunction = junctions.get(from)
        const toJunction = junctions.get(to)
        if(!fromJunction || !toJunction) { continue }
        fromJunction.to.delete(node)
        toJunction.from.delete(node)
        const newEdge: OSM.Edge<D["way"]> = {
            way: fromEdge.way,
            length: fromEdge.length + toEdge.length,
            cost: fromEdge.cost + toEdge.cost,
            nodes: fromEdge.nodes.concat(toEdge.nodes)
        }
        fromJunction.to.set(to, newEdge)
        toJunction.from.set(from, newEdge)
        junctions.delete(node)
    }
    return junctions
}

function getJunctions<D extends OSM.CustomData>(map: Map<OSM.Node, Junction<D>>, nodeId: OSM.Node) {
    let junction = map.get(nodeId)
    if(!junction) {
        junction = {to: new Map(), from: new Map()}
        map.set(nodeId, junction)
    }
    return junction
}