import { MinPriorityQueue } from "@datastructures-js/priority-queue"
import { GraphAccessor } from "../fileformat/index.js";
import { CandidatePool, RouteNode } from './cache.js';
export { RouteNode }

type FinishedRoute = [
    forward: RouteNode,
    backward: RouteNode,
    totalCost: number
]


export type CostFunction = (previous: RouteNode | null, edgeIndex: number, turnCost: number) => number

export type MergingFunction = (forward: RouteNode, backward: RouteNode) => number

type RoutingOptions = {
    maxCostPastBest: number,
    dynamicCostFunction: CostFunction,
}

const defaultOptions: RoutingOptions = {
    maxCostPastBest: 0,
    dynamicCostFunction: () => 0
}


export const enum Direction {
    Forward = 0,
    Backward = 1
}

export class Engine {
    pools = [
        new CandidatePool(),
        new CandidatePool()
    ] as const
    constructor (
        public data: GraphAccessor
    ) {}

    static async fromPath(path: string) {
        const graph = await GraphAccessor.fromPath(path)
        return new Engine(graph)
    }

    getNearbyEdges(
        lon: number, 
        lat: number,
        maxDistanceMeters = 50
    ) {
        const nodes = this.data.getNearbyNodes(lon, lat, Infinity, maxDistanceMeters)
        const edges: number[] = []
        for(const nodeId of nodes) {
            this.data.listNodeEdges(nodeId, (edgeIndex) => {
                edges.push(edgeIndex)
            })
        }
        return edges
    }

    djikstras(
        sourceEdges: number[],
        targetEdges: number[],
        opts: Partial<RoutingOptions & {backwards: boolean}> = {}
    ) {
        const targetEdgeSet = new Set(targetEdges)
        const direction = opts.backwards ? Direction.Backward : Direction.Forward
        const options = {...defaultOptions, ...opts}
        const pool = this.pools[direction]
        pool.init()
        const queue = this.#createQueue(sourceEdges, options, direction)
        if(queue === null) { return null }

        let bestRoute: RouteNode | null = null as RouteNode | null
        let i = 0
        while(true) {
            i++
            const next = queue.dequeue()
            if(!next) { break }
            if(
                bestRoute && 
                (bestRoute.totalCost + options.maxCostPastBest) < (next.totalCost)
            ) { break }
            if(targetEdgeSet.has(next.edgeIndex)) {
                if(!bestRoute || next.totalCost < bestRoute.totalCost) {
                    bestRoute = next
                }
            }
            const listFunc = direction === Direction.Forward ? this.data.listToEdges.bind(this.data) : this.data.listFromEdges.bind(this.data)
            listFunc(next.edgeIndex, (connectedEdgeIndex, cost) => {
                const dynamicCost = options.dynamicCostFunction(next, connectedEdgeIndex, cost)
                const fixedCost = this.#fixedCostFunction(next, connectedEdgeIndex, cost)
                const candidate = pool.push(connectedEdgeIndex, fixedCost, dynamicCost, next)
                if(!candidate) { return }
                queue.enqueue(candidate)
            })
        }
        return bestRoute
    }

    biDjikstras(
        sourceEdges: number[],
        targetEdges: number[],
        opts: Partial<RoutingOptions & {dynamicCostMergeFunction: MergingFunction}> = {}
    ) {
        const mergeFunction = opts.dynamicCostMergeFunction ?? ((forward, backward) => forward.dynamicCost + backward.dynamicCost)
        const options = { ...defaultOptions, ...opts}
        this.pools[Direction.Forward].init()
        this.pools[Direction.Backward].init()
        const forwardQueue = this.#createQueue(sourceEdges, options, Direction.Forward)
        const backwardQueue = this.#createQueue(targetEdges, options, Direction.Backward)
        if(forwardQueue === null || backwardQueue === null) { return null }

        const queues = [
            forwardQueue,
            backwardQueue
        ]
        let bestRoute: FinishedRoute | null = null
        while(true) {
            const bestForward = forwardQueue.front()
            const bestBackward = backwardQueue.front()
            if( !bestForward || !bestBackward ) { break }
            
            // This all sucks dammit
            const direction = bestForward.totalCost > bestBackward.totalCost ? Direction.Backward : Direction.Forward
            const isForward = direction === Direction.Forward

            const inverseDirection = isForward ? Direction.Backward : Direction.Forward
            
            const next = isForward ? bestForward : bestBackward
            const inverseNext = isForward ? bestBackward : bestForward

            const queue = queues[direction]
            queue.dequeue()

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
                const fixedCost = this.#fixedCostFunction(next, connectedEdgeIndex, cost)
                const candidate = this.pools[direction].push(connectedEdgeIndex, fixedCost, dynamicCost, next)
                if(!candidate) { return }
                queue.enqueue(candidate)
            })
        }
        return bestRoute
    }

    #fixedCostFunction(previous: RouteNode | null, _: number, turnCost: number) {
        return turnCost + (previous?.fixedCost ?? 0)
    }
    
    #createQueue(
        edges: number[],
        options: RoutingOptions,
        direction: Direction
    ) {
        const queue = new MinPriorityQueue<RouteNode>((candidate) => (candidate.fixedCost + candidate.dynamicCost))
        for(const edgeIndex of edges) {
            const candidate = this.pools[direction].push(
                edgeIndex,
                this.#fixedCostFunction(null, edgeIndex, 0), 
                options.dynamicCostFunction(null, edgeIndex, 0),
                null
            )
            if(candidate) {
                queue.enqueue(candidate)
            }
        }
        if(queue.size() <= 0) {
            return null
        }
        return queue
    }

    generateGeometry(
        route: RouteNode, 
        direction: Direction = Direction.Forward
    ) {
        const coordinates: [lon: number, lat: number][] = []
        // Here be dragons
        // And they be off by 1
        RouteNode.iter(route, (candidate) => {
            const edgeIndex = candidate.edgeIndex
            const nodesAmount = this.data.accessors.edges.nodeListLength(edgeIndex)
            const nodeListStartIndex = this.data.accessors.edges.nodeListIndex(edgeIndex)
            for(let i = 1; i <= nodesAmount - 1; i++) {
                let nodeListIndex: number
                if(direction === Direction.Forward) {
                    nodeListIndex = nodeListStartIndex + nodesAmount - i
                } else {
                    nodeListIndex = nodeListStartIndex + i
                }
                const nodeIndex = this.data.accessors.nodeList.nodeIndex(nodeListIndex)
                const pos = this.data.nodePos(nodeIndex)
                coordinates.push(pos)
            }
        })
        if(direction === Direction.Forward) {
            coordinates.reverse()
        }
        return coordinates
    }
}