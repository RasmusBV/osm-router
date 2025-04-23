import * as geokdbush from 'geokdbush';
import { MinPriorityQueue } from "@datastructures-js/priority-queue"
import { GraphAccessor } from "../fileformat/index.js";

export type RouteCandidate = [edgeIndex: number, fixedCost: number, dynamicCost: number, from: RouteCandidate | null]

export type WeightFunction = (previous: RouteCandidate | null, edgeIndex: number, turnCost: number) => number

export type Options = {
    maxDurationPastBest: number   
}


export class Engine {
    options: Options
    constructor (
        public data: GraphAccessor,
        options: Partial<Options> = {}
    ) {
        this.options = {...Engine.defaultOptions, ...options}
    }

    private weightFunction(previous: RouteCandidate | null, edgeIndex: number, turnCost: number) {
        const edgeCost = this.data.accessors.edges.cost(edgeIndex)
        return edgeCost + turnCost + (previous?.[1] ?? 0)
    }

    static defaultOptions: Options = {
        maxDurationPastBest: 0
    }

    snapToNode(lon: number, lat: number, maxDistance = 0.05) {
        return geokdbush.around(this.data.accessors.index as any, lon, lat, 1, maxDistance)[0] as number | undefined
    }

    getPath(from: number, to: number, dynamicCostFunction: (previous: RouteCandidate | null, edgeIndex: number, turnCost: number) => number = () => 0) {
        const fromNodeEdgeAmount = this.data.accessors.nodes.edgeListLength(from)
        const toNodeEdgeAmount = this.data.accessors.nodes.edgeListLength(to)
        if(fromNodeEdgeAmount === 0 || toNodeEdgeAmount === 0) { return }

        const edgeBestCost = new Map<number, number>()
        const unexplored = new MinPriorityQueue<RouteCandidate>((candidate) => (candidate[1] + candidate[2]))

        let bestRoute: RouteCandidate | undefined

        this.data.listNodeEdges(from, (edgeIndex) => {
            unexplored.enqueue([
                edgeIndex, 
                this.weightFunction(null, edgeIndex, 0), 
                dynamicCostFunction(null, edgeIndex, 0),
                null
            ])
        })
        while(true) {
            const next = unexplored.dequeue()
            if(!next) { return bestRoute }
            if(
                bestRoute && 
                (bestRoute[1] + bestRoute[2] + this.options.maxDurationPastBest) < (next[1] + next[2])
            ) { return bestRoute }
            const nextCost = next[1] + next[2]
            const currentBestCost = edgeBestCost.get(next[0])
            if(currentBestCost && currentBestCost < nextCost) { continue }
            edgeBestCost.set(next[0], nextCost)

            this.data.listEdgeConnections(next[0], (connectedEdgeIndex, turnCost) => {
                const dynamicCost = dynamicCostFunction(next, connectedEdgeIndex, turnCost)
                const fixedCost = this.weightFunction(next, connectedEdgeIndex, turnCost)
                const totalCost = dynamicCost + fixedCost
                const currentBestCost = edgeBestCost.get(connectedEdgeIndex)

                if(currentBestCost && (currentBestCost < totalCost)) { return }
                const candidate: RouteCandidate = [connectedEdgeIndex, fixedCost, dynamicCost, next]

                let foundDestination = false
                this.data.listEdgeNodes(connectedEdgeIndex, (nodeIndex) => {
                    if(nodeIndex === to) {
                        foundDestination = true
                        return false
                    }
                })
                if(foundDestination) {
                    if(!bestRoute) {
                        bestRoute = candidate
                    } else if((bestRoute[1] + bestRoute[2]) > (candidate[1] + candidate[2])) {
                        bestRoute = candidate
                    }
                } else {
                    unexplored.enqueue(candidate)
                }
            })
        }
    }

    generateGeometry(candidate: RouteCandidate | null) {
        const coordinates: [lon: number, lat: number][] = []
        let current = candidate
        while(current) {
            const edge = current[0]
            const nodesAmount = this.data.accessors.edges.nodeListLength(edge)
            let index = this.data.accessors.edges.nodeListIndex(edge)
            for(let i = nodesAmount-1; i > 0; i--) {
                const nodeIndex = this.data.accessors.nodeList.nodeIndex(index + i)
                coordinates.push(this.data.nodePos(nodeIndex))
            }
            current = current[3]
        }
        return coordinates
    }

}