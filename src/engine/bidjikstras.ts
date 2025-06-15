import { GraphAccessor } from "../fileformat/index.js";
import { CandidatePool } from './pool.js';
import { RouteNode, RoutingOptions, fixedCostFunction, defaultOptions, Direction } from "./common.js"
import { generateGeometry } from "./geometry.js";


export type MergingFunction = (forward: RouteNode, backward: RouteNode) => number

type BiDjikstraOptions = RoutingOptions & {
    dynamicCostMergeFunction: MergingFunction
}

type FinishedRoute = [
    RouteNode,
    RouteNode,
    number
]

export class BiDjikstras {
    pools: [
        forward: CandidatePool,
        backward: CandidatePool
    ]
    constructor (
        public data: GraphAccessor
    ) {
        this.pools = [
            new CandidatePool(data),
            new CandidatePool(data)
        ]
    }

    static async fromPath(path: string) {
        const graph = await GraphAccessor.fromPath(path)
        return new BiDjikstras(graph)
    }
    /**
     * Finds the shortest path from a set of source edges to a set of target edges using Dijkstra's algorithm.
     * 
     * This version allows for dynamic costs to be merged from both directions.
     * 
     * @param sourceEdges array of edge indices to start the search from
     * @param targetEdges array of edge indices to end the search at
     * @param opts optional routing options
     * @returns the best route found, or null if no route was found
     */
    run(
        sourceEdges: number[],
        targetEdges: number[],
        opts: Partial<BiDjikstraOptions> = {}
    ) {
        const mergeFunction = opts.dynamicCostMergeFunction ?? ((forward, backward) => forward.dynamicCost + backward.dynamicCost)
        const options = { ...defaultOptions, ...opts}
        if(
            !this.pools[Direction.Forward].init(sourceEdges, options) ||
            !this.pools[Direction.Backward].init(targetEdges, options)
        ) { return null }
        let bestRoute: FinishedRoute | null = null
        let i = 0
        while(true) {
            i++
            const bestForward = this.pools[Direction.Forward].peek()
            const bestBackward = this.pools[Direction.Backward].peek()
            if( !bestForward || !bestBackward ) { break }
            
            // This all sucks dammit
            const direction = bestForward.totalCost > bestBackward.totalCost ? Direction.Backward : Direction.Forward
            const inverseDirection = direction === Direction.Forward ? Direction.Backward : Direction.Forward

            const isForward = direction === Direction.Forward

            const next = isForward ? bestForward : bestBackward
            const inverseNext = isForward ? bestBackward : bestForward

            const pool = this.pools[direction]
            pool.next()

            if(
                bestRoute &&
                (bestRoute[2] + options.maxCostPastBest) < (next.totalCost + inverseNext.totalCost)
            ) { break }
            const opposingCandidate = this.pools[inverseDirection].getCandidate(next.edgeIndex)
            if(opposingCandidate) {
                const forward = isForward ? next : opposingCandidate
                const backward = isForward ? opposingCandidate : next

                const dynamicCost = mergeFunction(forward, backward)
                const fixedCost = next.fixedCost + opposingCandidate.fixedCost
                const totalCost = dynamicCost + fixedCost
                if(!bestRoute) {
                    bestRoute = [null, null, Infinity] as any as FinishedRoute
                }
                if(totalCost < bestRoute[2]) {
                    bestRoute[direction] = next
                    bestRoute[inverseDirection] = opposingCandidate
                    bestRoute[2] = totalCost
                }
            }
            const listFunc = direction === Direction.Forward ? this.data.listToEdges.bind(this.data) : this.data.listFromEdges.bind(this.data)
            listFunc(next.edgeIndex, (connectedEdgeIndex, cost) => {
                const dynamicCost = options.dynamicCostFunction(next, connectedEdgeIndex, cost)
                const fixedCost = fixedCostFunction(next, connectedEdgeIndex, cost)
                this.pools[direction].push(connectedEdgeIndex, fixedCost, dynamicCost, next)
            })
        }
        if(!bestRoute) { return null }
        return {
            forward: bestRoute[Direction.Forward],
            backward: bestRoute[Direction.Backward],
            totalCost: bestRoute[2],
            iterations: i
        }
    }

    generateGeometry(
        forward: RouteNode, 
        backward: RouteNode
    ) {
        // Out parameter :(
        const coordinates: [lon: number, lat: number][] = []
        generateGeometry(forward, Direction.Forward, this.data, coordinates)
        generateGeometry(backward, Direction.Backward, this.data, coordinates)
        return coordinates
    }
}