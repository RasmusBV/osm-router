import { Graph } from "../graph.js";
import { nthElement } from "./nthElement.js";
import * as OSM from "../../types.js"

type Node = {
    id: OSM.NodeId;
    pos: [lon: number, lat: number];
}

export function test(graph: Graph) {
    const nodes = [...graph.nodes.entries()].map(([id, node]): Node => ({id, pos: node.pos}))
    const compare = spatialComp(Math.PI/2)
    const size = 10
    const source = nthElement(nodes, size, undefined, undefined, compare)
    const sink = nthElement(nodes, nodes.length - size, size, undefined, compare)
    console.log(nodes.slice(0, size-1))
    console.log(nodes.slice(nodes.length-size))
}

function spatialComp(bearing: number) {
    const lonComp = Math.cos(bearing)
    const latComp = Math.sin(bearing)
    return (a: Node, b: Node) => {
        return project(a.pos, lonComp, latComp) - project(b.pos, lonComp, latComp)
    }
}

function project(pos: [lon: number, lat: number], lon: number, lat: number) {
    return pos[0] * lon + pos[1] * lat
}