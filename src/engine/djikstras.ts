import { GraphAccessor } from "../fileformat/index.js";
import { CandidatePool } from './pool.js';
import { RouteNode, RoutingOptions, fixedCostFunction, defaultOptions, Direction } from "./common.js"
import { generateGeometry } from "./geometry.js";


export type DjikstraResult = {
    route: RouteNode | null,
    iterations: number
}

type DjikstraOptions = RoutingOptions & {
    direction: Direction
}

export class Djikstras {
    pool: CandidatePool
    constructor (
        public data: GraphAccessor
    ) {
        this.pool = new CandidatePool(data)
    }

    static async fromPath(path: string) {
        const graph = await GraphAccessor.fromPath(path)
        return new Djikstras(graph)
    }
    /**
     * Finds the shortest path from a set of source edges to a set of target edges using Dijkstra's algorithm.
     * 
     * @param sourceEdges array of edge indices to start the search from
     * @param targetEdges array of edge indices to end the search at
     * @param opts optional routing options
     * @returns the best route found, or null if no route was found
     */
    run(
        sourceEdges: number[],
        targetEdges: number[],
        opts: Partial<DjikstraOptions> = {}
    ): DjikstraResult {
        const targetEdgeSet = new Set(targetEdges)
        const direction = opts.direction ?? Direction.Forward
        const options = {...defaultOptions, ...opts}
        if(!this.pool.init(sourceEdges, options)) { return {
            route: null,
            iterations: 0
        } }
        let bestRoute: RouteNode | null = null as RouteNode | null
        let i = 0
        while(true) {
            i++
            const next = this.pool.next()
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
                const fixedCost = fixedCostFunction(next, connectedEdgeIndex, cost)
                this.pool.push(connectedEdgeIndex, fixedCost, dynamicCost, next)
            })
        }
        return {
            route: bestRoute,
            iterations: i
        }
    }
    /**
     * Generates geometry from a route node.
     * 
     * @param route the route node to generate the geometry from
     * @param direction the direction the route was generated in, defaults to forward
     * @returns an array of coordinates representing the geometry of the route
     */
    generateGeometry(
        route: RouteNode, 
        direction: Direction = Direction.Forward
    ) {
        return generateGeometry(route, direction, this.data)
    }
}