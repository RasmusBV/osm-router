import { RoutingOptions, RouteNode, fixedCostFunction } from "./common.js"
import { GraphAccessor } from "../fileformat/deserialize.js"
import { PriorityQueue } from "@js-sdsl/priority-queue";

export class CandidatePool {
    private map: (RouteNode | undefined)[]
    private queue = new PriorityQueue<RouteNode>(undefined, (a, b) => a.totalCost - b.totalCost)

    
    constructor(
        public data: GraphAccessor
    ) {
        this.map = Array.from({length: (data.sections.edges.buffer.byteLength / data.sizes.edges)}, () => undefined)
    }

    init(
        edges: number[],
        options: RoutingOptions
    ) {
        this.queue.clear()
        this.map.fill(undefined)
        for(const edgeIndex of edges) {
            this.push(
                edgeIndex,
                fixedCostFunction(null, edgeIndex, 0), 
                options.dynamicCostFunction(null, edgeIndex, 0),
                null
            )
        }
        if(this.queue.size() <= 0) {
            return false
        }
        return true
    }

    
    getCandidate(edgeIndex: number | null | undefined) {
        if(edgeIndex === undefined || edgeIndex === null ) { return undefined }
        const candidate = this.map[edgeIndex]
        if(!candidate) { return undefined }
        return candidate
    }
    push(
        edgeIndex: number, 
        fixedCost: number, 
        dynamicCost: number, 
        parent: RouteNode | null
    ) {
        const current = this.map[edgeIndex]
        const totalCost = fixedCost + dynamicCost
        if(
            current &&
            current.totalCost <= totalCost
        ) {
            return undefined
        }
        const index = parent ? (parent.index + 1) : 0
        const totalLength = (parent?.totalLength ?? 0) + this.data.accessors.edges.length(edgeIndex)
        const candidate: RouteNode = {
            edgeIndex,
            fixedCost,
            totalLength,
            dynamicCost,
            totalCost,
            parent,
            index
        }
        this.map[edgeIndex] = candidate
        this.queue.push(candidate)
        return candidate
    }
    next() {
        return this.queue.pop()
    }
    peek() {
        return this.queue.top()
    }
}